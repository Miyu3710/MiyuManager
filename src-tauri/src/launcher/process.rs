#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub class_name: String,
    pub exe_path: String,
    pub title: String,
}

#[cfg(windows)]
mod platform {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::time::{Duration, Instant};

    use anyhow::{Result, bail};
    use windows_sys::Win32::Foundation::{
        CloseHandle, FALSE, HANDLE, HWND, INVALID_HANDLE_VALUE, LPARAM, RECT,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicProcessIdList,
        QueryInformationJobObject, TerminateJobObject,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
        QueryFullProcessImageNameW, TerminateProcess,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GW_OWNER, GWL_EXSTYLE, GetClassNameW, GetForegroundWindow, GetWindow,
        GetWindowLongW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsWindowVisible, WS_EX_TOOLWINDOW,
    };

    use super::WindowInfo;

    const MAX_JOB_PROCESSES: usize = 256;

    #[repr(C)]
    struct JobProcessList {
        assigned: u32,
        in_list: u32,
        process_ids: [usize; MAX_JOB_PROCESSES],
    }

    pub struct ProcessJob {
        handle: isize,
    }

    // Windows handles are process-local values; ownership is guarded by ProcessJob.
    unsafe impl Send for ProcessJob {}
    unsafe impl Sync for ProcessJob {}

    impl ProcessJob {
        pub fn create() -> Result<Self> {
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                bail!("无法创建进程作业对象：{}", std::io::Error::last_os_error());
            }
            let job = Self {
                handle: handle as isize,
            };
            Ok(job)
        }

        fn raw(&self) -> HANDLE {
            self.handle as HANDLE
        }

        pub fn assign(&self, child: &Child) -> Result<()> {
            let process = child.as_raw_handle() as HANDLE;
            let assigned = unsafe { AssignProcessToJobObject(self.raw(), process) };
            if assigned == FALSE {
                bail!(
                    "无法把游戏进程加入作业对象：{}",
                    std::io::Error::last_os_error()
                );
            }
            Ok(())
        }

        pub fn terminate(&self) -> Result<()> {
            let terminated = unsafe { TerminateJobObject(self.raw(), 1) };
            if terminated == FALSE {
                bail!("无法结束游戏进程树：{}", std::io::Error::last_os_error());
            }
            Ok(())
        }

        pub fn active_process_ids(&self) -> Result<Vec<u32>> {
            let mut info = JobProcessList {
                assigned: 0,
                in_list: 0,
                process_ids: [0; MAX_JOB_PROCESSES],
            };
            let queried = unsafe {
                QueryInformationJobObject(
                    self.raw(),
                    JobObjectBasicProcessIdList,
                    (&mut info as *mut JobProcessList).cast(),
                    std::mem::size_of::<JobProcessList>() as u32,
                    std::ptr::null_mut(),
                )
            };
            if queried == FALSE {
                bail!("无法读取游戏进程树：{}", std::io::Error::last_os_error());
            }
            let count = (info.in_list as usize).min(MAX_JOB_PROCESSES);
            Ok(info.process_ids[..count]
                .iter()
                .map(|value| *value as u32)
                .collect())
        }
    }

    impl Drop for ProcessJob {
        fn drop(&mut self) {
            if self.handle != 0 {
                unsafe {
                    CloseHandle(self.raw());
                }
                self.handle = 0;
            }
        }
    }

    pub fn process_image_path(pid: u32) -> Option<String> {
        if pid == 0 {
            return None;
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) };
        if handle.is_null() {
            return None;
        }
        let mut buffer = vec![0u16; 32_768];
        let mut length = buffer.len() as u32;
        let read =
            unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length) };
        unsafe {
            CloseHandle(handle);
        }
        if read == FALSE || length == 0 {
            return None;
        }
        Some(
            OsString::from_wide(&buffer[..length as usize])
                .to_string_lossy()
                .to_string(),
        )
    }

    pub fn foreground_process_id() -> Option<u32> {
        let window = unsafe { GetForegroundWindow() };
        if window.is_null() {
            return None;
        }
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(window, &mut pid);
        }
        (pid != 0).then_some(pid)
    }

    struct WindowSearch {
        target: String,
        class_prefix: Option<String>,
        include_owned: bool,
        best: Option<(u64, WindowInfo)>,
    }

    unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> i32 {
        let search = unsafe { &mut *(lparam as *mut WindowSearch) };
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }
        if !search.include_owned && !unsafe { GetWindow(hwnd, GW_OWNER) }.is_null() {
            return 1;
        }
        let style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
        if style & WS_EX_TOOLWINDOW != 0 {
            return 1;
        }

        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let Some(exe_path) = process_image_path(pid) else {
            return 1;
        };
        if !same_path(&exe_path, &search.target) {
            return 1;
        }

        let mut class_buffer = [0u16; 256];
        let class_len =
            unsafe { GetClassNameW(hwnd, class_buffer.as_mut_ptr(), class_buffer.len() as i32) };
        if class_len <= 0 {
            return 1;
        }
        let class_name = OsString::from_wide(&class_buffer[..class_len as usize])
            .to_string_lossy()
            .to_string();
        if search
            .class_prefix
            .as_deref()
            .is_some_and(|prefix| !class_name.starts_with(prefix))
        {
            return 1;
        }

        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            return 1;
        }
        let width = (rect.right - rect.left).max(0) as u64;
        let height = (rect.bottom - rect.top).max(0) as u64;
        if width < 160 || height < 120 {
            return 1;
        }
        let area = width * height;
        if search.best.as_ref().is_some_and(|(best, _)| *best >= area) {
            return 1;
        }

        let title_len = unsafe { GetWindowTextLengthW(hwnd) }.max(0) as usize;
        let mut title_buffer = vec![0u16; title_len + 1];
        let title_len =
            unsafe { GetWindowTextW(hwnd, title_buffer.as_mut_ptr(), title_buffer.len() as i32) };
        let title = if title_len > 0 {
            OsString::from_wide(&title_buffer[..title_len as usize])
                .to_string_lossy()
                .to_string()
        } else {
            String::new()
        };
        search.best = Some((
            area,
            WindowInfo {
                class_name,
                exe_path,
                title,
            },
        ));
        1
    }

    fn find_window(
        exe_path: &str,
        class_prefix: Option<&str>,
        include_owned: bool,
    ) -> Option<WindowInfo> {
        let mut search = WindowSearch {
            target: exe_path.to_string(),
            class_prefix: class_prefix.map(str::to_string),
            include_owned,
            best: None,
        };
        unsafe {
            EnumWindows(
                Some(collect_window),
                &mut search as *mut WindowSearch as LPARAM,
            );
        }
        search.best.map(|(_, window)| window)
    }

    pub fn wait_for_window_by_executable(exe_path: &str, timeout: Duration) -> Option<WindowInfo> {
        wait_for_window(exe_path, None, false, timeout)
    }

    #[cfg(test)]
    pub fn wait_for_window_by_class(
        exe_path: &str,
        class_prefix: &str,
        timeout: Duration,
    ) -> Option<WindowInfo> {
        wait_for_window(exe_path, Some(class_prefix), true, timeout)
    }

    fn wait_for_window(
        exe_path: &str,
        class_prefix: Option<&str>,
        include_owned: bool,
        timeout: Duration,
    ) -> Option<WindowInfo> {
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(window) = find_window(exe_path, class_prefix, include_owned) {
                // Give a splash/loading window a moment to be replaced by the main window.
                std::thread::sleep(Duration::from_millis(700));
                return find_window(exe_path, class_prefix, include_owned).or(Some(window));
            }
            if Instant::now() >= deadline {
                return None;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    fn same_path(left: &str, right: &str) -> bool {
        normalize_path(left) == normalize_path(right)
    }

    fn normalize_path(path: &str) -> String {
        let path = path.replace('/', "\\");
        let path = path
            .strip_prefix("\\\\?\\UNC\\")
            .map(|rest| format!("\\\\{rest}"))
            .or_else(|| path.strip_prefix("\\\\?\\").map(str::to_string))
            .unwrap_or(path);
        path.to_lowercase()
    }

    pub fn process_ids_with_name(name: &str) -> Vec<u32> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let expected = name.to_lowercase();
        let mut process_ids = Vec::new();
        let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != FALSE;
        while has_entry {
            let length = entry
                .szExeFile
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(entry.szExeFile.len());
            let process_name = OsString::from_wide(&entry.szExeFile[..length])
                .to_string_lossy()
                .to_lowercase();
            if process_name == expected {
                process_ids.push(entry.th32ProcessID);
            }
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != FALSE;
        }
        unsafe {
            CloseHandle(snapshot);
        }
        process_ids
    }

    pub fn terminate_process(pid: u32) -> Result<()> {
        let handle = unsafe { OpenProcess(PROCESS_TERMINATE, FALSE, pid) };
        if handle.is_null() {
            bail!("无法打开要结束的进程：{}", std::io::Error::last_os_error());
        }
        let terminated = unsafe { TerminateProcess(handle, 1) };
        unsafe {
            CloseHandle(handle);
        }
        if terminated == FALSE {
            bail!("无法结束游戏进程：{}", std::io::Error::last_os_error());
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use std::process::Child;

    use anyhow::{Result, bail};

    use super::WindowInfo;

    pub struct ProcessJob;

    impl ProcessJob {
        pub fn create() -> Result<Self> {
            bail!("当前平台不支持 Windows 进程作业对象")
        }

        pub fn assign(&self, _child: &Child) -> Result<()> {
            bail!("当前平台不支持 Windows 进程作业对象")
        }

        pub fn terminate(&self) -> Result<()> {
            bail!("当前平台不支持 Windows 进程作业对象")
        }

        pub fn active_process_ids(&self) -> Result<Vec<u32>> {
            bail!("当前平台不支持 Windows 进程作业对象")
        }
    }

    pub fn process_image_path(_pid: u32) -> Option<String> {
        None
    }

    pub fn foreground_process_id() -> Option<u32> {
        None
    }

    pub fn wait_for_window_by_executable(
        _exe_path: &str,
        _timeout: std::time::Duration,
    ) -> Option<WindowInfo> {
        None
    }

    #[cfg(test)]
    pub fn wait_for_window_by_class(
        _exe_path: &str,
        _class_prefix: &str,
        _timeout: std::time::Duration,
    ) -> Option<WindowInfo> {
        None
    }

    pub fn process_ids_with_name(_name: &str) -> Vec<u32> {
        Vec::new()
    }

    pub fn terminate_process(_pid: u32) -> Result<()> {
        bail!("当前平台不支持 Windows 进程终止")
    }
}

pub use platform::{
    ProcessJob, foreground_process_id, process_ids_with_name, process_image_path,
    terminate_process, wait_for_window_by_executable,
};

#[cfg(test)]
pub use platform::wait_for_window_by_class;

#[cfg(windows)]
mod platform {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use anyhow::{Result, bail};
    use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicProcessIdList,
        QueryInformationJobObject, TerminateJobObject,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

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
}

#[cfg(not(windows))]
mod platform {
    use std::process::Child;

    use anyhow::{Result, bail};

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
}

pub use platform::{ProcessJob, foreground_process_id, process_image_path};

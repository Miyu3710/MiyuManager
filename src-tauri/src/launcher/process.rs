#[cfg(windows)]
mod platform {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use anyhow::{Result, bail};
    use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
    };

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
    }
}

pub use platform::ProcessJob;

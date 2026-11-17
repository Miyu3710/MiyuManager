use anyhow::{Context, Result, anyhow};
use std::path::Path;

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const VALUE_NAME: &str = "MiyuManager";

pub fn silent_requested() -> bool {
    std::env::args().any(|arg| arg.eq_ignore_ascii_case("--silent"))
}

pub fn apply(enabled: bool, silent: bool) -> Result<()> {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(RUN_KEY)
            .context("无法打开 Windows 启动项")?;
        if enabled {
            let executable = std::env::current_exe().context("无法定位 MiyuManager 可执行文件")?;
            key.set_value(VALUE_NAME, &command_line(&executable, silent))
                .context("无法写入 Windows 启动项")?;
        } else {
            match key.delete_value(VALUE_NAME) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(anyhow!("无法移除 Windows 启动项：{error}")),
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (enabled, silent);
    }
    Ok(())
}

fn command_line(executable: &Path, silent: bool) -> String {
    let mut command = format!("\"{}\"", executable.display());
    if silent {
        command.push_str(" --silent");
    }
    command
}

#[tauri::command]
pub fn startup_silent() -> bool {
    silent_requested()
}

#[cfg(test)]
mod tests {
    use super::command_line;
    use std::path::Path;

    #[test]
    fn quotes_executable_and_appends_silent_flag() {
        let path = Path::new(r"C:\Program Files\MiyuManager\MiyuManager.exe");
        assert_eq!(
            command_line(path, false),
            r#""C:\Program Files\MiyuManager\MiyuManager.exe""#
        );
        assert_eq!(
            command_line(path, true),
            r#""C:\Program Files\MiyuManager\MiyuManager.exe" --silent"#
        );
    }
}

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use image::{ImageFormat, ImageReader};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use tauri::http::{Response, StatusCode, header};

use crate::db;

const MAX_SOURCE_BYTES: u64 = 30 * 1024 * 1024;
const THUMB_WIDTH: u32 = 480;
const THUMB_HEIGHT: u32 = 720;

const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "bmp"];
const COVER_STEMS: [&str; 9] = [
    "cover",
    "package",
    "box",
    "jacket",
    "thumbnail",
    "thumb",
    "poster",
    "title",
    "game",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverAsset {
    pub work_id: i64,
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCandidate {
    pub path: String,
    pub file_name: String,
    pub width: u32,
    pub height: u32,
}

fn relative_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn is_image_extension(path: &Path) -> bool {
    extension_of(path).is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.as_str()))
}

fn verify_source(path: &Path) -> Result<PathBuf> {
    let source = dunce::canonicalize(path)
        .with_context(|| format!("图片不存在或无法访问：{}", path.display()))?;
    if !source.is_file() {
        bail!("不是图片文件：{}", source.display());
    }
    if !is_image_extension(&source) {
        bail!("只支持 PNG、JPEG、WebP 和 BMP 图片");
    }
    let metadata = std::fs::metadata(&source)?;
    if metadata.len() > MAX_SOURCE_BYTES {
        bail!("图片不能超过 30 MB");
    }
    Ok(source)
}

fn asset_dir(data_dir: &Path, work_id: i64) -> PathBuf {
    data_dir
        .join("assets")
        .join("covers")
        .join(work_id.to_string())
}

fn remove_cached_files(data_dir: &Path, original_path: Option<&str>, thumb_path: Option<&str>) {
    let root = data_dir.join("assets");
    for relative in [original_path, thumb_path].into_iter().flatten() {
        let candidate = root.join(relative);
        let Ok(canonical) = dunce::canonicalize(&candidate) else {
            continue;
        };
        if canonical.starts_with(&root) {
            let _ = std::fs::remove_file(canonical);
        }
    }
}

pub async fn set_cover(
    pool: &SqlitePool,
    data_dir: &Path,
    work_id: i64,
    source_path: &str,
    source: &str,
) -> Result<CoverAsset> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    if !matches!(source, "manual" | "local") {
        bail!("未知的封面来源");
    }
    let source_file = verify_source(Path::new(source_path))?;
    let bytes = std::fs::read(&source_file)
        .with_context(|| format!("无法读取图片：{}", source_file.display()))?;
    set_cover_bytes(
        pool,
        data_dir,
        work_id,
        &bytes,
        &source_file.to_string_lossy(),
        source,
    )
    .await
}

pub async fn set_cover_bytes(
    pool: &SqlitePool,
    data_dir: &Path,
    work_id: i64,
    bytes: &[u8],
    source_path: &str,
    source: &str,
) -> Result<CoverAsset> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    if !matches!(source, "manual" | "local" | "online") {
        bail!("未知的封面来源");
    }
    if bytes.is_empty() {
        bail!("封面图片为空");
    }
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        bail!("图片不能超过 30 MB");
    }
    let checksum = format!("{:x}", Sha256::digest(bytes));
    let mut reader = ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .context("无法识别图片格式")?;
    let format = reader.format();
    let extension = match format {
        Some(ImageFormat::Jpeg) => "jpg",
        Some(ImageFormat::WebP) => "webp",
        Some(ImageFormat::Bmp) => "bmp",
        _ => "png",
    };
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(12_000);
    limits.max_image_height = Some(12_000);
    reader.limits(limits);
    let image = reader.decode().context("图片解码失败")?;
    let (width, height) = (image.width(), image.height());
    if width == 0 || height == 0 {
        bail!("图片尺寸无效");
    }

    let directory = asset_dir(data_dir, work_id);
    std::fs::create_dir_all(&directory)
        .with_context(|| format!("无法创建封面缓存目录：{}", directory.display()))?;
    let token = uuid::Uuid::new_v4().simple().to_string();
    let original_name = format!("original-{token}.{extension}");
    let thumb_name = format!("thumb-{token}.webp");
    let original_file = directory.join(&original_name);
    let thumb_file = directory.join(&thumb_name);
    std::fs::write(&original_file, bytes).context("无法写入封面原图缓存")?;

    let thumbnail = if width > THUMB_WIDTH || height > THUMB_HEIGHT {
        image.thumbnail(THUMB_WIDTH, THUMB_HEIGHT)
    } else {
        image
    };
    thumbnail
        .save_with_format(&thumb_file, ImageFormat::WebP)
        .context("无法生成 WebP 封面缩略图")?;

    let original_relative = relative_string(
        original_file
            .strip_prefix(data_dir.join("assets"))
            .context("封面缓存路径异常")?,
    );
    let thumb_relative = relative_string(
        thumb_file
            .strip_prefix(data_dir.join("assets"))
            .context("封面缓存路径异常")?,
    );

    let old = sqlx::query(
        "SELECT original_path, thumb_path FROM assets WHERE work_id = ? AND kind = 'cover'",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    sqlx::query(
        "INSERT INTO assets
           (work_id, kind, original_path, thumb_path, source_path, width, height, checksum, source)
         VALUES (?, 'cover', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(work_id, kind) DO UPDATE SET
           original_path = excluded.original_path,
           thumb_path = excluded.thumb_path,
           source_path = excluded.source_path,
           width = excluded.width,
           height = excluded.height,
           checksum = excluded.checksum,
           source = excluded.source,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    )
    .bind(work_id)
    .bind(&original_relative)
    .bind(&thumb_relative)
    .bind(source_path)
    .bind(i64::from(width))
    .bind(i64::from(height))
    .bind(checksum)
    .bind(source)
    .execute(pool)
    .await?;

    if let Some(row) = old {
        let old_original: String = row.try_get("original_path")?;
        let old_thumb: String = row.try_get("thumb_path")?;
        if old_original != original_relative || old_thumb != thumb_relative {
            remove_cached_files(data_dir, Some(&old_original), Some(&old_thumb));
        }
    }

    Ok(CoverAsset {
        work_id,
        original_path: original_relative,
        thumb_path: thumb_relative,
        width,
        height,
        source: source.to_string(),
    })
}

pub async fn clear_cover(pool: &SqlitePool, data_dir: &Path, work_id: i64) -> Result<()> {
    let row = sqlx::query(
        "SELECT original_path, thumb_path FROM assets WHERE work_id = ? AND kind = 'cover'",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    sqlx::query("DELETE FROM assets WHERE work_id = ? AND kind = 'cover'")
        .bind(work_id)
        .execute(pool)
        .await?;
    if let Some(row) = row {
        let original: String = row.try_get("original_path")?;
        let thumb: String = row.try_get("thumb_path")?;
        remove_cached_files(data_dir, Some(&original), Some(&thumb));
    }
    Ok(())
}

fn dimension_of(path: &Path) -> Option<(u32, u32)> {
    let reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
    reader.into_dimensions().ok()
}

fn candidate_score(path: &Path, width: u32, height: u32) -> i32 {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut score = 0;
    for (index, expected) in COVER_STEMS.iter().enumerate() {
        if stem == *expected {
            score += 100 - index as i32 * 5;
        } else if stem.contains(expected) {
            score += 40 - index as i32 * 2;
        }
    }
    if width > 0 && height > 0 {
        let ratio = f64::from(width) / f64::from(height);
        let target = 2.0 / 3.0;
        if (ratio - target).abs() < 0.02 {
            score += 45;
        } else if (ratio - target).abs() < 0.12 {
            score += 20;
        }
        if width >= 240 && height >= 360 {
            score += 15;
        }
    }
    score
}

pub async fn discover_covers(pool: &SqlitePool, work_id: i64) -> Result<Vec<CoverCandidate>> {
    let working_dir: Option<String> = sqlx::query_scalar(
        "SELECT lc.working_dir FROM local_copies lc
         JOIN releases r ON r.id = lc.release_id
         WHERE r.work_id = ? ORDER BY lc.id ASC LIMIT 1",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    let Some(working_dir) = working_dir else {
        return Ok(Vec::new());
    };
    let root = PathBuf::from(working_dir);
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut directories = vec![root.clone()];
    for name in ["cover", "covers", "image", "images", "package", "pack"] {
        let nested = root.join(name);
        if nested.is_dir() {
            directories.push(nested);
        }
    }

    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for directory in directories {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten().take(2_000) {
            let path = entry.path();
            if !path.is_file() || !is_image_extension(&path) {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string();
            let stem = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let looks_like_cover = COVER_STEMS.iter().any(|name| stem.contains(name));
            if !looks_like_cover {
                continue;
            }
            let Ok(canonical) = dunce::canonicalize(&path) else {
                continue;
            };
            if !seen.insert(canonical.clone()) {
                continue;
            }
            let Some((width, height)) = dimension_of(&canonical) else {
                continue;
            };
            candidates.push((
                candidate_score(&canonical, width, height),
                CoverCandidate {
                    path: canonical.to_string_lossy().to_string(),
                    file_name,
                    width,
                    height,
                },
            ));
        }
    }
    candidates.sort_by_key(|left| std::cmp::Reverse(left.0));
    Ok(candidates
        .into_iter()
        .take(12)
        .map(|(_, candidate)| candidate)
        .collect())
}

fn content_type(path: &Path) -> &'static str {
    match extension_of(path).as_deref() {
        Some("webp") => "image/webp",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn not_found(message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn serve_asset(data_dir: &Path, request_path: &str) -> Response<Vec<u8>> {
    let relative = request_path.trim_start_matches('/');
    if relative.is_empty()
        || relative.contains("..")
        || relative.contains('\\')
        || relative.contains('\0')
        || !relative.split('/').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|value| value.is_ascii() && value.is_ascii_graphic() && value != '/')
        })
    {
        return not_found("invalid asset path");
    }
    let root = data_dir.join("assets");
    let requested = root.join(relative);
    let Ok(canonical) = dunce::canonicalize(&requested) else {
        return not_found("asset not found");
    };
    let Ok(canonical_root) = dunce::canonicalize(&root) else {
        return not_found("asset cache missing");
    };
    if !canonical.starts_with(canonical_root) {
        return not_found("asset outside cache");
    }
    let Ok(bytes) = std::fs::read(&canonical) else {
        return not_found("asset unreadable");
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type(&canonical))
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(bytes)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cover_detection_ignores_arbitrary_images() {
        assert!(COVER_STEMS.iter().any(|name| "game_cover".contains(name)));
        assert!(
            !COVER_STEMS
                .iter()
                .any(|name| "screenshot-01".contains(name))
        );
    }

    #[test]
    fn asset_paths_reject_traversal() {
        let response = serve_asset(Path::new("C:\\missing"), "/../secret.webp");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn caches_cover_original_and_webp_thumbnail() {
        let pool = db::open_memory_pool().await.expect("pool");
        let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES ('月影工房')")
            .execute(&pool)
            .await
            .expect("work")
            .last_insert_rowid();
        let temp = tempfile::TempDir::new().expect("temp");
        let source = temp.path().join("封面 原图.png");
        let mut image = image::RgbaImage::new(300, 450);
        for pixel in image.pixels_mut() {
            *pixel = image::Rgba([180, 70, 60, 255]);
        }
        image.save(&source).expect("source image");

        let asset = set_cover(
            &pool,
            temp.path(),
            work_id,
            &source.to_string_lossy(),
            "manual",
        )
        .await
        .expect("cover");
        assert!(asset.thumb_path.ends_with(".webp"));
        let thumb = temp.path().join("assets").join(&asset.thumb_path);
        let original = temp.path().join("assets").join(&asset.original_path);
        assert!(thumb.is_file());
        assert!(original.is_file());
        let dimensions = ImageReader::open(&thumb)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .into_dimensions()
            .unwrap();
        assert_eq!(dimensions, (300, 450));

        let response = serve_asset(temp.path(), &("/".to_string() + &asset.thumb_path));
        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.body().is_empty());

        clear_cover(&pool, temp.path(), work_id)
            .await
            .expect("clear");
        assert!(!thumb.exists());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets WHERE work_id = ?")
            .bind(work_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}

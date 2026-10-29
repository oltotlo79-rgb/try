use std::fs;

/// 保存ダイアログを開き、選ばれた場所へテキストを書き込む。
/// CSV は Excel で文字化けしないよう BOM 付き UTF-8 にする。
/// 戻り値: 保存したファイル名（キャンセル時は None）
#[tauri::command]
async fn save_text_file(
    default_name: String,
    content: String,
    bom: bool,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let picked = rfd::AsyncFileDialog::new()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &exts)
        .save_file()
        .await;
    let Some(handle) = picked else { return Ok(None) };
    let path = handle.path().to_path_buf();
    let mut bytes = Vec::with_capacity(content.len() + 3);
    if bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(content.as_bytes());
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_text_file])
        .run(tauri::generate_context!())
        .expect("制作物依頼システムの起動に失敗しました");
}

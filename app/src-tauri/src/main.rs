// リリースビルドでコンソール窓を出さない
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    seisakubutsu_irai_lib::run()
}

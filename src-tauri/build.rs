fn main() {
    // MSVC defaults to a 1 MiB main-thread stack. Tauri's embedded context and
    // backend initialization need more room (startup hit STATUS_STACK_OVERFLOW).
    // Reserve virtual address space; committed memory still grows on demand.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        println!("cargo:rustc-link-arg-bin=php-ide=/STACK:8388608");
    }
    tauri_build::build()
}

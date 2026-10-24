//! macOS launch surface. No WebView, filesystem reads or frontend runtime.
use tauri::Manager;

#[cfg(target_os = "macos")]
mod platform {
    use objc2::{rc::Retained, AnyThread, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApplication, NSBackingStoreType, NSColor, NSFont, NSImage, NSImageView, NSTextAlignment,
        NSTextField, NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSData, NSPoint, NSRect, NSSize, NSString};
    use std::cell::RefCell;

    thread_local! { static WINDOW: RefCell<Option<Retained<NSWindow>>> = const { RefCell::new(None) }; }

    pub fn show() {
        let mtm = MainThreadMarker::new().expect("Splash must start on the main thread");
        NSApplication::sharedApplication(mtm);
        let rect = NSRect::new(NSPoint::new(0., 0.), NSSize::new(460., 300.));
        // SAFETY: AppKit is initialized on the main thread; the retained window owns
        // its content. Disable AppKit's implicit release before storing it in Rust.
        let window = unsafe {
            let w = NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                rect,
                NSWindowStyleMask::Borderless,
                NSBackingStoreType::Buffered,
                false,
            );
            w.setReleasedWhenClosed(false);
            w
        };
        window.setTitle(&NSString::from_str("PHP IDE — Starting"));
        window.setOpaque(false);
        window.setBackgroundColor(Some(&NSColor::clearColor()));
        window.setHasShadow(true);
        let view = NSView::initWithFrame(NSView::alloc(mtm), rect);
        // A transparent window lets the rounded content define its silhouette and shadow.
        view.setWantsLayer(true);
        if let Some(layer) = view.layer() {
            layer.setCornerRadius(20.);
            layer.setMasksToBounds(true);
            let background = NSColor::colorWithSRGBRed_green_blue_alpha(0.118, 0.122, 0.133, 1.);
            layer.setBackgroundColor(Some(&background.CGColor()));
        }
        let data = NSData::with_bytes(include_bytes!("../icons/128x128@2x.png"));
        if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
            let logo = NSImageView::imageViewWithImage(&image, mtm);
            logo.setFrame(NSRect::new(NSPoint::new(182., 152.), NSSize::new(96., 96.)));
            view.addSubview(&logo);
        }
        for (text, y, size) in [("PHP IDE", 100., 28.), ("Starting…", 64., 14.)] {
            let label = NSTextField::labelWithString(&NSString::from_str(text), mtm);
            label.setFrame(NSRect::new(NSPoint::new(30., y), NSSize::new(400., 38.)));
            label.setAlignment(NSTextAlignment::Center);
            label.setFont(Some(&NSFont::systemFontOfSize(size)));
            label.setTextColor(Some(&NSColor::colorWithWhite_alpha(0.92, 1.)));
            view.addSubview(&label);
        }
        window.setContentView(Some(&view));
        window.center();
        window.orderFrontRegardless();
        window.displayIfNeeded();
        super::trace("native-image-visible-before-webview");
        WINDOW.with(|slot| *slot.borrow_mut() = Some(window));
    }

    pub fn active() -> bool {
        WINDOW.with(|slot| slot.borrow().is_some())
    }

    pub fn close() {
        WINDOW.with(|slot| {
            if let Some(window) = slot.borrow_mut().take() {
                window.close();
                super::trace("native-splash-closed");
            }
        });
    }
}

pub fn show() {
    #[cfg(target_os = "macos")]
    platform::show();
}

fn reveal(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Missing main window")?;
    window.show().map_err(|e| e.to_string())?;
    trace("main-visible");
    #[cfg(target_os = "macos")]
    platform::close();
    Ok(())
}

/// Only the main UI can finish startup. AppKit objects never cross threads.
#[tauri::command]
pub async fn startup_ready(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unauthorized window".into());
    }
    trace("frontend-ready-or-recovery");
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(reveal(&handle));
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

pub fn watchdog(app: tauri::AppHandle) {
    // Even a failed bootstrap must not leave the real window inaccessible.
    #[cfg(target_os = "macos")]
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if platform::active() {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.eval(
                        r#"{
                    const status = document.getElementById('startup-status');
                    if (status) status.textContent = 'Startup is taking longer than expected.';
                    const retry = document.getElementById('startup-retry');
                    if (retry) { retry.hidden = false; retry.onclick = () => location.reload(); }
                }"#,
                    );
                }
                trace("native-watchdog-recovery");
                let _ = reveal(&handle);
            }
        });
    });
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Test-only evidence, written beside the existing isolated smoke report.
pub fn trace(event: &str) {
    if let Some(report) = std::env::var_os("PHP_IDE_NATIVE_SMOKE") {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(std::path::PathBuf::from(report).with_extension("splash.log"))
        {
            let _ = writeln!(file, "{event}");
        }
    }
}

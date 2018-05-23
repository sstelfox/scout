extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use actix_web::{App, fs, HttpResponse, middleware, server};
use dotenv::dotenv;

fn main() {
    dotenv().ok();
    env_logger::init();

    let sys = actix::System::new("scout");

    server::new(move || vec![
        App::new()
            .prefix("/api/v1")
            .middleware(middleware::Logger::default())
            .resource("/", |r| r.f(|_r| HttpResponse::Ok())),
        // No logger for the static routes for now...
        App::new()
            .middleware(middleware::Logger::default())
            .handler("/", fs::StaticFiles::new("./static/").index_file("index.html")),
    ]).bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}

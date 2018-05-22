extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use actix_web::{App, HttpRequest, middleware, server};
use dotenv::dotenv;

fn index(_req: HttpRequest) -> &'static str {
    "TODO: Serve file"
}

fn main() {
    dotenv().ok();
    env_logger::init();

    let sys = actix::System::new("scout");

    server::new(move ||
        App::new()
            .middleware(middleware::Logger::default())
            .resource("/", |r| r.f(index))
    ).bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}

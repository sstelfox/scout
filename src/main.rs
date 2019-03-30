extern crate dotenv;
extern crate env_logger;
extern crate gotham;
extern crate hyper;
extern crate log;
extern crate mime;
extern crate serde_json;

#[macro_use]
extern crate serde_derive;

use dotenv::dotenv;
use gotham::middleware::logger::RequestLogger;
use gotham::pipeline::new_pipeline;
use gotham::pipeline::single::single_pipeline;
use gotham::router::Router;
use gotham::router::builder::*;

use log::Level;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum AnalyticData {
    #[serde(rename = "start")]
    RequestStart {
        #[serde(rename = "ts")]
        timestamp: usize,

        #[serde(rename = "bfs")]
        browser_first_seen: usize,

        #[serde(rename = "sfs")]
        session_first_seen: usize,

        title: String,
        url: String,
    },

    #[serde(rename = "end")]
    RequestEnd {
        #[serde(rename = "ts")]
        timestamp: usize,
    },

    #[serde(rename = "performance")]
    Performance {
        #[serde(rename = "ts")]
        timestamp: usize,

        #[serde(rename = "perfEntry")]
        entry: PerfEntry,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticRequest {
    #[serde(rename = "bid")]
    browser_id: usize,

    #[serde(rename = "sid")]
    session_id: usize,

    #[serde(rename = "svc")]
    session_view_count: usize,

    #[serde(rename = "ts")]
    timestamp: usize,

    data: Vec<AnalyticData>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorReport {
    msg: String,
    stack: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "entryType")]
enum PerfEntry {
    #[serde(rename = "navigate")]
    Navigate {
    },

    #[serde(rename = "navigation")]
    Navigation {
        name: String,
    },

    #[serde(rename = "paint")]
    Paint {
        duration: f64,
        name: String,

        #[serde(rename = "startTime")]
        start_time: f64,
    },

    #[serde(rename = "reload")]
    Reload {
    },

    #[serde(rename = "resource")]
    Resource {
    },
}

mod fixed_responses {
    use gotham::helpers::http::response::create_response;
    use gotham::state::State;
    use hyper::{Body, Response, StatusCode};

    pub fn home_page(state: State) -> (State, Response<Body>) {
        let response = create_response(&state, StatusCode::OK, mime::TEXT_PLAIN, "Nothing to see here...\n");
        (state, response)
    }
}

mod stats {
    use gotham::helpers::http::response::create_empty_response;
    use gotham::state::State;
    use hyper::{Body, Response, StatusCode};

    pub fn error(state: State) -> (State, Response<Body>) {
        let response = create_empty_response(&state, StatusCode::OK);
        (state, response)
    }

    pub fn record(state: State) -> (State, Response<Body>) {
        let response = create_empty_response(&state, StatusCode::OK);
        (state, response)
    }
}

fn router() -> Router {
    let (chain, pipelines) = single_pipeline(
        new_pipeline()
            .add(RequestLogger::new(Level::Info))
            .build()
    );

    build_router(chain, pipelines, |route| {
        route.get("/").to(fixed_responses::home_page);

        route.post("/api/v1/error_report").to(stats::error);
        route.post("/api/v1/stats").to(stats::record);
    })
}

pub fn main() {
    dotenv().ok();
    env_logger::init();

    let bind_address = match std::env::var("SCOUT_ADDR") {
        Ok(val) => val,
        Err(_) => String::from("[::1]:3000"),
    };

    gotham::start(bind_address, router())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotham::test::TestServer;
    use hyper::StatusCode;

    #[test]
    fn check_basic_response() {
        let test_server = TestServer::new(router()).unwrap();

        let response = test_server.client().get("http://[::1]/").perform().unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body = response.read_body().unwrap();
        assert_eq!(&body[..], b"Nothing to see here...\n");
    }
}

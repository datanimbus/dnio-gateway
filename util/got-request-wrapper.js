const got = require("got");
let FormData = require('form-data');

function getGOTOptions(options) {
	let gotOptions = {};
	gotOptions.throwHttpErrors = false;
	gotOptions.url = options.url;
	gotOptions.method = options.method;
	gotOptions.headers = options.headers;
	if (gotOptions.headers) {
		Object.keys(gotOptions.headers).forEach(key => {
			if (!gotOptions.headers[key]) {
				delete gotOptions.headers[key];
			}
		});
	}
	if (options.json) {
		gotOptions.responseType = "json";
	}
	if (options.body) {
		if (options.body instanceof FormData) {
			gotOptions.body = options.body;
		} else {
			gotOptions.json = options.body;
		}
	}
	if (options.qs) {
		gotOptions.searchParams = options.qs;
	}
	gotOptions.followRedirect = false;
	return gotOptions;
}

function handleError(err, callback) {
	let error = {};
	error.code = err.code;
	error.name = err.name;
	error.message = err.message;
	error.stack = err.stack;
	if (error.code == "ECONNREFUSED") {
		callback(null, null, null);
	} else {
		callback(error, null, null);
	}
}

function request(options, callback) {
	const gotOptions = getGOTOptions(options);
	got(gotOptions).then((res) => {
		if (res) {
			callback(null, res, res.body);
		} else {
			callback(null, null, null);
		}
	}).catch(err => {
		handleError(err, callback);
	});
}

function get(options, callback) {
	const gotOptions = getGOTOptions(options);
	gotOptions.method = "GET";
	got(gotOptions).then((res) => {
		if (res) {
			callback(null, res, res.body);
		} else {
			callback(null, null, null);
		}
	}).catch(err => {
		handleError(err, callback);
	});
}

function put(options, callback) {
	const gotOptions = getGOTOptions(options);
	gotOptions.method = "PUT";
	got(gotOptions).then((res) => {
		if (res) {
			callback(null, res, res.body);
		} else {
			callback(null, null, null);
		}
	}).catch(err => {
		handleError(err, callback);
	});
}

function post(options, callback) {
	const gotOptions = getGOTOptions(options);
	gotOptions.method = "POST";
	got(gotOptions).then((res) => {
		if (res) {
			callback(null, res, res.body);
		} else {
			callback(null, null, null);
		}
	}).catch(err => {
		handleError(err, callback);
	});
}

function remove(options, callback) {
	const gotOptions = getGOTOptions(options);
	gotOptions.method = "DELETE";
	got(gotOptions).then((res) => {
		if (res) {
			callback(null, res, res.body);
		} else {
			callback(null, null, null);
		}
	}).catch(err => {
		handleError(err, callback);
	});
}


module.exports = {
	request: request,
	get: get,
	put: put,
	post: post,
	delete: remove
};
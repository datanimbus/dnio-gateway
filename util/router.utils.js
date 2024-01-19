/* eslint-disable no-async-promise-executor */


const log4js = require('log4js');
const fs = require('fs');
const got = require('got');
const FormData = require('form-data');
const _ = require('lodash');

const commonUtils = require('./common.utils');

let logger = log4js.getLogger(global.loggerName);
let e = {};

async function makeProxyRequest(txnId, options) {
	options.url = options.host + options.path;
	delete options.path;
	delete options.host;
	options.followRedirect = false;
	logger.debug(`[${txnId}] Send request :: URL :: ${options.url}`);
	if (options.method == 'GET') {
		delete options.body;
		delete options.files;
	}
	if (options.body && !_.isEmpty(options.body)) {
		options.json = options.body;
		delete options.body;
		delete options.files;
	}
	if (options.files && !_.isEmpty(options.files)) {
		delete options.headers['content-type'];
		delete options.headers['content-length'];
		const form = new FormData();
		form.append('file', fs.createReadStream(options.files.file.tempFilePath), { filename: options.files.file.name });
		options.body = form;
	}
	options.throwHttpErrors = false;
	try {
		let resp = await got(options);
		if (resp.headers['content-type'] && resp.headers['content-type'].indexOf('application/json') > -1) {
			resp.body = JSON.parse(resp.body);
		}
		if (resp.statusCode < 200 || resp.statusCode > 209) {
			return { body: resp.body, statusCode: resp.statusCode, headers: resp.headers };
		} else {
			return resp;
		}
	} catch (err) {
		let errMessage = getErrorMessage(err);
		logger.error('Error Proxying Request :: ', errMessage);
		logger.error(err);
		return { statusCode: 500, body: err };
	}
}

function getHost(path, router, target) {
	let routes = Object.keys(router);
	let selectedKey = routes.find(key => path.startsWith(key));
	return selectedKey ? router[selectedKey] : target;
}

function getPath(path, pathRewrite) {
	let routes = Object.keys(pathRewrite);
	let selectedKey = routes.find(key => path.startsWith(key));
	return selectedKey ? path.replace(selectedKey, pathRewrite[selectedKey]) : path;
}

function getHeaders(req) {
	let headers = req.headers;
	delete headers.connection;
	delete headers.host;
	delete headers['content-length'];
	delete headers['accept-encoding'];
	delete headers['if-none-match'];
	headers.user = req.user ? req.user._id : undefined;
	headers.isSuperAdmin = req.user ? req.user.isSuperAdmin : false;
	return headers;
}

function getErrorMessage(err) {
	let msg;
	if (err.body) {
		if (typeof err.body == 'object') {
			msg = err.body.message || err.body;
		} else if (typeof err.body == 'string') {
			try {
				err.body = JSON.parse(err.body);
				msg = err.body.message || err.body;
			} catch (e) {
				msg = err.body;
			}
		} else {
			msg = err.body.message || err.body;
		}
	} else if (err.message) {
		msg = err.message;
	} else {
		if (typeof err == 'string') {
			msg = err;
		} else {
			msg = JSON.stringify(err);
		}
	}
	return msg;
}

e.ProxyRoute = (config) => {
	return async (req, res, next) => {
		let txnId = req.headers['TxnId'];
		// Nothing to do if OPTIONS Request
		if (req.method === 'OPTIONS') {
			return next();
		}

		let router = config.router;
		let routerPromise = Promise.resolve();
		if (typeof config.router === 'function') {
			routerPromise = config.router(req);
		} else {
			routerPromise = Promise.resolve(router ? getHost(req.path, router, config.target) : config.target);
		}

		let proxyPath = getPath(req.originalUrl, config.pathRewrite);
		let proxyHost = await routerPromise;
		if (proxyHost == 'next') {
			return next();
		}

		let proxyOptions = {};
		proxyOptions.headers = getHeaders(req);
		proxyOptions.host = proxyHost;
		proxyOptions.path = proxyPath;
		proxyOptions.method = req.method;
		if (req.query && _.isEmpty(req.query)) {
			proxyOptions.searchParams = req.query;
		}
		proxyOptions.body = req.body;
		proxyOptions.files = req.files;


		let safeResponse = await makeProxyRequest(txnId, proxyOptions);

		if (proxyOptions.files) {
			Object.keys(proxyOptions.files).forEach(file => {
				fs.unlinkSync(proxyOptions.files[file].tempFilePath);
			});
		}

		if (safeResponse.statusCode >= 200 && safeResponse.statusCode < 400) {
			if (safeResponse.statusCode == 302 && safeResponse.headers) {
				if (safeResponse.headers.location) {
					res.setHeader('Location', safeResponse.headers.location);
					return res.status(302).end();
				}
			}
			// Check is cookie is set
			logger.debug(`[${txnId}] Routing MW :: Set-Cookie :: ${safeResponse.headers['set-cookie'] || 'NIL'}`);
			if (safeResponse.headers['set-cookie']) {
				res.setHeader('set-cookie', safeResponse.headers['set-cookie']);
			}

			//Check if response is file data stream
			if (global.DOWNLOAD_URLS.some((url) => commonUtils.compareUrl(url, proxyPath))) {
				safeResponse.pipe(res);
			} else {
				//Check if response is handled
				if (config.onRes && typeof config.onRes === 'function') {
					res.status(safeResponse.statusCode);
					config.onRes(req, res, safeResponse.body);
				} else {
					res.status(safeResponse.statusCode).json(safeResponse.body);
				}
			}
		} else {
			logger.error(`[${txnId}] Error Routing MW :: ${JSON.stringify(safeResponse)}`);
			return res.status(safeResponse.statusCode).send(safeResponse.body);
		}
	};
};

module.exports = e;

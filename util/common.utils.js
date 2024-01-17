const log4js = require('log4js');
const crypto = require('crypto');
const { v1: uuid } = require('uuid');

let logger = log4js.getLogger(global.loggerName);
let e = {};


e.randomStr = function (len) {
	let str = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < len; i++) {
		str += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return str;
};

e.getTxnId = (req) => {
	req.headers['TxnId'] = uuid();
	if (!req.path.startsWith('/gw/health')) logger.debug(`getTxnId() :: req.headers.TxnId :: ${req.headers.TxnId}`);
};

e.compareUrl = (tempUrl, url) => {
	let tempUrlSegment = tempUrl.split('/').filter(_d => _d != '');
	let urlSegment = url.split('/').filter(_d => _d != '');
	if (tempUrlSegment.length != urlSegment.length) return false;

	tempUrlSegment.shift();
	urlSegment.shift();

	let flag = tempUrlSegment.every((_k, i) => {
		if (_k.startsWith('{') && _k.endsWith('}') && urlSegment[i] != '') return true;
		return _k === urlSegment[i];
	});
	logger.trace(`Compare URL :: ${tempUrl}, ${url} :: ${flag}`);
	return flag;
};

e.md5 = data => {
	return crypto.createHash('md5').update(data).digest('hex');
};

e.isPermittedURL = (req) => {
	return global.PERMITTED_URLS.some(_url => e.compareUrl(_url, req.path));
};

e.hasDuplicate = (arr) => {
	return arr.length !== Array.from(new Set(arr)).length;
};

e.getDuplicateValues = (arr) => {
	var duplicates = arr.filter(a => arr.indexOf(a) !== arr.lastIndexOf(a));
	return Array.from(new Set(duplicates));
};

module.exports = e;
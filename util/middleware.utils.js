const log4js = require('log4js');
const JWT = require('jsonwebtoken');

const { getVariables } = require('../config/config.vars');
const gwUtil = require('./common.utils');
const cacheUtils = require('./cache.utils').cache;
const mongoUtils = require('./mongo.utils');

const logger = log4js.getLogger(global.loggerName);

let e = {};

e.requestLogger = (req, res, next) => {
	gwUtil.getTxnId(req);
	if (!req.path.startsWith('/gw/internal/health')) {
		logger.info(`[${req.header('txnId')}] [${req.hostname}] ${req.method} ${req.path}`);
	}
	res.set('TxnId', req.header('txnId'));
	next();
};

e.notPermittedUrlCheck = (req, res, next) => {
	let isNotPermitted = global.INTERNAL_URLS.some(_p => gwUtil.compareUrl(_p, req.path), true);
	if (isNotPermitted) {
		return res.status(403).json({ message: 'This URL is Internal' });
	}
	logger.trace(`[${req.header('txnId')}] Permitted URL :: ${req.path}`);
	next();
};

e.checkTokenMiddleware = (req, res, next) => {
	const envVars = getVariables();
	if (gwUtil.isPermittedURL(req)) return next();

	logger.debug(`[${req.header('txnId')}] Validating token format`);
	let token = req.header('authorization');

	if (!token) {
		logger.debug(`[${req.header('txnId')}] No token found in 'authorization' header`);
		logger.debug(`[${req.header('txnId')}] Checking for 'authorization' token in cookie`);
		token = req.cookies.Authorization;
	}

	if (gwUtil.compareUrl('/api/a/rbac/auth/logout', req.path) && !token) return res.status(200).json({ message: 'Logged out successfully' });

	if (!token) {
		logger.debug(`[${req.header('txnId')}] No token found in cookie or header`);
		return res.status(401).json({ message: 'Unauthorized' });
	}

	token = token.split('JWT ')[1];
	let user;
	try {
		user = JWT.verify(token, envVars.RBAC_JWT_KEY);
	} catch (err) {
		logger.error(`[${req.header('txnId')}] Invalid JWT`);
		return res.status(401).json({ 'message': 'Unauthorized' });
	}
	if (!user) {
		logger.error(`[${req.header('txnId')}] Invalid JWT format`);
		return res.status(401).json({ 'message': 'Unauthorized' });
	}

	let tokenHash = gwUtil.md5(token);
	logger.debug(`[${req.header('txnId')}] Token hash :: ${tokenHash}`);
	req.tokenHash = tokenHash;

	req.user = typeof user === 'string' ? JSON.parse(user) : user;
	logger.trace(`[${req.header('txnId')}] Token Data : ${JSON.stringify(req.user)}`);
	next();
};

e.corsMiddleware = (req, res, next) => {
	if (req.header('X-Forwarded-For')) logger.info(`[${req.header('txnId')}] X-Forwarded-For :: ${req.header('X-Forwarded-For')}`);
	if (process.env.MODE.toLowerCase() == 'dev') res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,access-control-allow-methods,access-control-allow-origin,*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');

	if (req.method == 'OPTIONS') return res.end();

	next();
};

e.storeUserPermissions = async function (req, res, next) {
	try {
		if (gwUtil.isPermittedURL(req)) return next();
		const userId = req.user._id;
		const keys = await cacheUtils.client.keys(`perm:${userId}_*`) || [];
		if (!keys || keys.length == 0) {
			const permissions = await mongoUtils.aggregate('userMgmt.groups', [
				{ $match: { users: userId } },
				{ $unwind: '$roles' },
				{ $group: { _id: '$roles.app', perms: { $addToSet: '$roles.id' } } }
			]);
			if (permissions && permissions.length > 0) {
				let promises = permissions.map(async (element) => {
					return await cacheUtils.setUserPermissions(userId + '_' + element._id, element.perms);
				});
				await Promise.all(promises);
			}
		}
		next();
	} catch (err) {
		logger.error(`[${req.get('TxnId')}] Error while storing permissions`);
		logger.error(err);
		res.status(500).json({ message: err.message });
	}
};

module.exports = e;

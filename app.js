'use strict';

(async () => {
	const os = require('os');
	const path = require('path');
	const log4js = require('log4js');
	const express = require('express');
	const cookieParser = require('cookie-parser');
	const fileUpload = require('express-fileupload');
	const fileSizeParser = require('filesize-parser');

	const VERSION = require('./package.json').version;
	const { getVariables } = require('./config/config.vars.js');

	const ENV_VAR = await getVariables();
	const LOG_LEVEL = ENV_VAR.LOG_LEVEL ? ENV_VAR.LOG_LEVEL : 'info';
	const PORT = ENV_VAR.PORT || 9080;
	const FQDN = ENV_VAR.FQDN ? ENV_VAR.FQDN.split(':').shift() : 'localhost';
	const LOGGER_NAME = (ENV_VAR.KUBERNETES_SERVICE_HOST && ENV_VAR.KUBERNETES_SERVICE_PORT) ? `[${ENV_VAR.DATA_STACK_NAMESPACE}] [${ENV_VAR.HOSTNAME}] [GW ${VERSION}]` : `[GW ${VERSION}]`;
	const API_REQUEST_TIMEOUT = ENV_VAR.API_REQUEST_TIMEOUT || 120;
	const MAX_JSON_SIZE = ENV_VAR.MAX_JSON_SIZE || '5KB';
	const MAX_FILE_SIZE = ENV_VAR.MAX_FILE_SIZE || '5MB';
	let ALLOWED_FILE_TYPES = ENV_VAR.ALLOWED_FILE_TYPES || ENV_VAR.defaultAllowedFileTypes;
	ALLOWED_FILE_TYPES = ALLOWED_FILE_TYPES.split(',');

	global.loggerName = LOGGER_NAME;

	log4js.configure({
		appenders: { out: { type: 'stdout', layout: { type: 'basic' } } },
		categories: { default: { appenders: ['out'], level: LOG_LEVEL.toUpperCase() } }
	});

	const { init } = require('./init');
	const middlewareUtils = require('./util/middleware.utils.js');
	const routerUtils = require('./util/router.utils.js');
	const diagUtils = require('./util/diag.utils.js');
	// const fileUtils = require('./util/file-manager.utils.js');


	init();
	const logger = log4js.getLogger(LOGGER_NAME);
	const app = express();

	logger.info(`Data service max JSON size :: ${MAX_JSON_SIZE}`);
	logger.info(`Data service max file upload size :: ${MAX_FILE_SIZE}`);
	logger.info(`Allowed file types : ${ALLOWED_FILE_TYPES}`);

	app.use(cookieParser());
	app.use(express.json({ limit: MAX_JSON_SIZE }));
	app.use(fileUpload({ useTempFiles: true, tempFileDir: path.join(os.tmpdir(), 'gw-files') }));

	const diagRouter = express.Router({ mergeParams: true });
	diagRouter.get('/internal/health/ready', diagUtils.healthReadyHandler);
	diagRouter.get('/internal/health/live', diagUtils.healthLiveHandler);
	diagRouter.get('/diag', diagUtils.diagnosticHandler);
	diagRouter.put('/fileStatus/:action', diagUtils.dsFileImportStatusHandler);
	// diagRouter.put('/file/upload', fileUtils.uploadFileHandler);
	// diagRouter.put('/file/download', fileUtils.downloadFileHandler);

	app.use(middlewareUtils.requestLogger);
	app.use(middlewareUtils.corsMiddleware);
	app.use(middlewareUtils.notPermittedUrlCheck);
	app.use(middlewareUtils.checkTokenMiddleware);
	app.use(middlewareUtils.storeUserPermissions);
	app.put('/api/a/rbac/usr/hb', middlewareUtils.checkUserHB);
	app.use(['/gw', '/api/a/gw'], diagRouter);

	app.use((req, res, next) => {
		let urlSplit = req.path.split('/');
		if ((urlSplit[5] && urlSplit[5] === 'fileMapper') || (urlSplit[4] && urlSplit[4] === 'usr' && urlSplit[5] && urlSplit[5] === 'bulkCreate')) {
			next();
		} else {
			const sizeInBytes = fileSizeParser(MAX_FILE_SIZE);
			if (req.files && req.files.file && req.files.file.size > sizeInBytes) {
				res.status(413).json({ message: 'File Too Large, max file size should be ' + MAX_FILE_SIZE });
			} else {
				next();
			}
		}
	});

	app.use(routerUtils.ProxyRoute({
		target: ENV_VAR.get('gw'),
		router: function (req) {
			let fixRoutes = {
				'/api/a/bm': ENV_VAR.get('bm'),
				'/api/a/cm': ENV_VAR.get('cm'),
				'/api/a/common': ENV_VAR.get('common'),
				'/api/a/mon': ENV_VAR.get('mon'),
				'/api/a/sm': ENV_VAR.get('sm'),
				'/api/a/rbac': ENV_VAR.get('user')
			};
			logger.debug(`[${req.headers.TxnId}] getRouterMiddleware :: ${req.path}`);
			let selectedKey = Object.keys(fixRoutes).find(key => req.path.startsWith(key));
			if (selectedKey) {
				return Promise.resolve(fixRoutes[selectedKey]);
			}
			let urlSplit = req.path.split('/');
			if (req.path.startsWith('/api/c')) {
				if (urlSplit[3] && !urlSplit[3].match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]+$/)) {
					throw new Error('APP_NAME_ERROR :: App name must consist of alphanumeric characters or \'-\' , and must start and end with an alphanumeric character.');
				}
				if (urlSplit[4] && !urlSplit[4].match(/^[a-zA-Z][a-zA-Z0-9]*$/)) {
					throw new Error('DATA_SERVICE_NAME_ERROR :: Data Service name must consist of alphanumeric characters, and must start with an alphabet.');
				}
				let api = urlSplit[3] + '/' + urlSplit[4];
				logger.info(`[${req.headers.TxnId}] Master service router API :: ${api}`);
				return global.masterServiceRouter[api];
			} else {
				return 'next';
			}
		},
		pathRewrite: {
			'/api/a/': '/',
			'/api/c/': '/'
		},
		onRes: function (req, res, body) {
			if ((req.path === '/api/a/rbac/auth/login'
				|| req.path === '/api/a/rbac/auth/refresh'
				|| req.path === '/api/a/rbac/auth/check'
				|| req.path === '/api/a/rbac/auth/validate') && res.statusCode === 200) {
				let cookieJson = { httpOnly: true, expire: new Date(body.expiresIn) };
				if (FQDN != 'localhost') {
					cookieJson = {
						sameSite: true,
						secure: true,
						domain: FQDN,
						path: '/api/'
					};
				}
				res.cookie('Authorization', 'JWT ' + body.token, cookieJson);
			}
			if (req.path === '/api/a/rbac/auth/logout' && res.statusCode === 200) {
				res.cookie('Authorization', null, { maxAge: 0 });
				res.cookie('azure-token', null, { maxAge: 0 });
			}
			if (typeof body == 'string') {
				res.write(body);
				res.end();
				return;
			} else {
				return res.json(body);
			}
		}
	}));

	app.use(function (error, req, res, next) {
		if (error) {
			logger.error('Global error handler - ', error);
			if (!res.headersSent) {
				let statusCode = error.statusCode || 500;
				if (error?.message?.includes('APP_NAME_ERROR') || error?.message?.includes('DATA_SERVICE_NAME_ERROR') || error?.message?.includes('FUNCTION_NAME_ERROR')) {
					statusCode = 400;
				}
				res.status(statusCode).json({
					message: error.message
				});
			}
		} else {
			next();
		}
	});

	const server = app.listen(PORT, (err) => {
		if (err) {
			logger.error(err);
			process.exit(0);
		}
		logger.info('Server started on port ' + PORT);
	});
	server.setTimeout(parseInt(API_REQUEST_TIMEOUT) * 1000);
})();

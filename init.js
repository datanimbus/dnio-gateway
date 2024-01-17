const log4js = require('log4js');
const { CronJob } = require('cron');
const JWT = require('jsonwebtoken');
const _ = require('lodash');

const { getVariables } = require('./config/config.vars');
const { getDSRouteMap } = require('./util/cache.utils');

const logger = log4js.getLogger(global.loggerName);

async function init() {
	try {
		let envVars = await getVariables();
		const token = JWT.sign({ name: 'DS_GATEWAY', _id: 'admin', isSuperAdmin: true }, envVars.RBAC_JWT_KEY);
		global.GW_TOKEN = token;
		global.INTERNAL_URLS = await getInternalUrls();
		global.PERMITTED_URLS = await getPermittedUrls();
		global.DOWNLOAD_URLS = await getDownloadUrls();
		new CronJob('1 * * * * *', updateRouteMap);
	} catch (err) {
		logger.error('Error in init()');
		logger.error(err);
	}
}

async function updateRouteMap() {
	try {
		global.masterServiceRouter = await getDSRouteMap();
		logger.debug('Route Map Updated');
	} catch (err) {
		logger.error('Error in updateRouteMap()');
		logger.error(err);
	}
}

async function getInternalUrls() {
	try {
		logger.debug('Internal URLs');
		return [
			'/api/a/sm/{app}/service/{id}/statusChange',
			'/api/a/sm/internal/ds/env',
			'api/a/mon/{app}/appcenter/{id}/audit/purge/{type}'
		]; //Change logic to fetch from Config Manager
	} catch (err) {
		logger.error('Error in getInternalUrls()');
		logger.error(err);
	}
}

async function getPermittedUrls() {
	try {
		logger.debug('Permitted URLs');
		return [
			'/api/a/rbac/auth/login',
			'/api/a/rbac/auth/ldap/login',
			'/api/a/rbac/auth/azure/login',
			'/api/a/rbac/auth/azure/login/callback',
			'/api/a/rbac/auth/azure/userFetch/callback',
			'/api/a/rbac/auth/authType/{id}',
			'/api/a/bm/auth/login',
			'/gw/internal/health/live',
			'/gw/internal/health/ready'
		]; //Change logic to fetch from Config Manager
	} catch (err) {
		logger.error('Error in getInternalUrls()');
		logger.error(err);
	}
}

async function getDownloadUrls() {
	try {
		logger.debug('Download URLs');
		return [
			'/rbac/{app}/user/utils/bulkCreate/{id}/download',
			'/bm/{app}/agent/utils/{id}/download/exec'
		]; //Change logic to fetch from Config Manager
	} catch (err) {
		logger.error('Error in getDownloadUrls()');
		logger.error(err);
	}
}

module.exports.init = init;

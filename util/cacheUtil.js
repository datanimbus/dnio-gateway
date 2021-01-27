"use strict";

const bluebird = require("bluebird");
const redis = require("ioredis");
bluebird.promisifyAll(redis);

let logger = global.logger;
let envConfig = require("../config/config");

let host = process.env.CACHE_HOST;
let port = process.env.CACHE_PORT;
let client = null;

let e = {};

function getClusterNodes() {
	let nodes = [];
	//format: 127.0.0.1,127.0.0.2:8990 results in 127.0.0.1:6379 and 127.0.0.2:8990 respectively
	let clusterNodes = process.env.CACHE_CLUSTER.split(",");
	clusterNodes.map(node => {
		nodes.push({
			host: node.split(":")[0],
			port: node.split(":")[1] || "6379",
		});
	});
	return nodes;
}

e.init = () => {
	if (process.env.CACHE_CLUSTER) {
		logger.info("Connecting to Redis cluster");
		logger.info("Redis cluster nodes :: ", JSON.stringify(getClusterNodes()));
		client = new redis.Cluster(getClusterNodes());
	}
	else {
		logger.info("Connecting to standalone Redis");
		client = redis.createClient(port, host);
	}
	client.on("error", function (err) {
		logger.error(err.message);
	});

	client.on("connect", function () {
		logger.info("Redis client connected");
	});
};

async function setCache(key, value, expiry) {
	try {
		await client.setAsync(key, value);
		if (expiry) await client.expireAsync(key, expiry);
	} catch (_error) {
		logger.error(_error);
	}
}

function getCache(key) {
	return client.getAsync(key);
}

function deleteCache(key) {
	return client.delAsync(key);
}

e.getApp = async (_isSuperAdmin, _key) => {
	if(_isSuperAdmin) return [];
	let data = await client.getAsync(`app:${_key}`);
	data = data ? JSON.parse(data) : [];
	return data;
};

e.cacheValidateJWT = async (_req, _expandId, _body) => {
	let key = `${envConfig.cacheKeyPrefix.validate}:${_expandId}-${_req.tokenHash}`;
	_req.headers.cache = _expandId;
	logger.debug(`Internal cache key :: ${key}`);
	try {
		return await setCache(key, JSON.stringify(_body), envConfig.validationCacheExpiry)
			.then(() => logger.debug(`Internal cache :: Set :: ${key}`));
	} catch (_error) {
		logger.error(_error);
	}
};

e.getCachedValidateJWT = async (_expandId, _tokenHash) => {
	let key = `${envConfig.cacheKeyPrefix.validate}:${_expandId}-${_tokenHash}`;
	logger.debug(`Internal cache :: Get :: ${key}`);
	try {
		let data =  await getCache(key);
		return JSON.parse(data);
	} catch (_error) {
		logger.error(_error);
	}
};

e.cacheRoleAppcenter = (entity, body) => {
	return setCache(`${envConfig.cacheKeyPrefix.appcenterRole}:${entity}`, JSON.stringify(body), envConfig.roleCacheExpiry);
};

e.getCachedRoleAppcenter = (entity) => {
	let key = `${envConfig.cacheKeyPrefix.appcenterRole}:${entity}`;
	return getCache(key)
		.then(_d => {
			if (_d) {
				return JSON.parse(_d);
			}
		})
		.catch(err => {
			logger.error(err);
		});
};

e.deleteCachedRoleAppcenter = (entity) => {
	let key = `${envConfig.cacheKeyPrefix.appcenterRole}:${entity}`;
	logger.debug("Deleting cache " + key);
	return deleteCache(key)
		.catch(err => {
			logger.error(err);
		});
};

module.exports = e;

'use strict';
const log4js = require('log4js');

const logger = log4js.getLogger(global.loggerName);

let e = {};


e.aggregate = async (collection, aggregationPipeline) => {
	logger.trace('MongoDB aggregate() on author DB');
	logger.trace(`MongoDB aggregate() : collection : ${collection}`);
	logger.trace(`MongoDB aggregate() : aggregationPipeline : ${JSON.stringify(aggregationPipeline)}`);
	try {
		return await global.authorDB.collection(collection).aggregate(aggregationPipeline).toArray();
	} catch (err) {
		logger.error(err);
		throw 'DB lookup error';
	}
};

module.exports = e;
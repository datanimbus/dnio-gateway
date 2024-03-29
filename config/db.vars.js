const mongoose = require('mongoose');
const ENV = require('./env.vars');

async function getVariables() {
	try {
		await mongoose.connect(ENV.MONGO_AUTHOR_URL, { dbName: ENV.MONGO_AUTHOR_DBNAME });

		const e = {};
		const varList = await mongoose.connection.collection('config.envVariables')
			.find({ classification: 'Runtime' })
			.project({
				_id: 1,
				value: 1
			}).toArray();
		if (!varList || varList.length === 0) {
			throw new Error('No environment variables found in the database');
		}
		varList.forEach(item => {
			e[item._id] = item.value;
		});

		e.RBAC_HB_MISS_COUNT = e.RBAC_HB_MISS_COUNT ? parseInt(e.RBAC_HB_MISS_COUNT) : 1;
		e.RBAC_HB_INTERVAL = e.RBAC_HB_INTERVAL ? parseInt(e.RBAC_HB_INTERVAL) * e.RBAC_HB_MISS_COUNT : 50 * e.RBAC_HB_MISS_COUNT;
		e.RBAC_JWT_KEY = e.RBAC_JWT_KEY || 'u?5k167v13w5fhjhuiweuyqi67621gqwdjavnbcvadjhgqyuqagsduyqtw87e187etqiasjdbabnvczmxcnkzn';
		return e;
	} catch (err) {
		console.log(err);
	}
}

module.exports.getVariables = getVariables;
const ENV = require('./env.vars');
const DB = require('./db.vars');

async function getVariables() {
	const e = {};
	const dbVars = await DB.getVariables();
	Object.keys(ENV).forEach(key => {
		e[key] = ENV[key];
	});
	Object.keys(dbVars).forEach(key => {
		e[key] = dbVars[key];
	});

	if (e.isK8sEnv()) {
		console.log('*** K8s environment detected ***');
		console.log('Image version: ' + e.IMAGE_TAG);
	} else {
		console.log('*** Local environment detected ***');
	}

	e.get = (service) => {
		if (e.isK8sEnv()) {
			if (service == 'bm') return `http://bm.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'cm') return `http://cm.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'common') return `http://common.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'gw') return `http://gw.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'mon') return `http://mon.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'ne') return `http://ne.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'sm') return `http://sm.${e.DATA_STACK_NAMESPACE}`;
			if (service == 'user') return `http://user.${e.DATA_STACK_NAMESPACE}`;

		} else {
			if (service == 'bm') return 'http://localhost:10011';
			if (service == 'cm') return 'http://localhost:11011';
			if (service == 'common') return 'http://localhost:3000';
			if (service == 'gw') return 'http://localhost:9080';
			if (service == 'mon') return 'http://localhost:10005';
			if (service == 'ne') return 'http://localhost:10010';
			if (service == 'sm') return 'http://localhost:10003';
			if (service == 'user') return 'http://localhost:10004';
		}
	};

	e.baseUrlBM = e.get('bm') + '/bm';
	e.baseUrlCOM = e.get('common') + '/common';
	e.baseUrlGW = e.get('gw') + '/gw';
	e.baseUrlMON = e.get('mon') + '/mon';
	e.baseUrlNE = e.get('ne') + '/ne';
	e.baseUrlSM = e.get('sm') + '/sm';
	e.baseUrlUSR = e.get('user') + '/rbac';

	return e;
}

module.exports.getVariables = getVariables;
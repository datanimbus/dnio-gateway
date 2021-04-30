const authUtil = require("../util/authUtil");
let logger = global.logger;

function getServiceInfo(id, collectionName) {
	return global.mongoConnectionAuthor.collection(collectionName).findOne({ _id: id }, { app: 1 });
}

module.exports = [{
	url: "/api/a/sm",
	getEntity: (req) => {
		let splitUrl = req.path.split("/");

		if (authUtil.compareUrl("/api/a/sm/{app}/service/start", req.path) || authUtil.compareUrl("/api/a/sm/{app}/service/stop", req.path)) {
			return Promise.resolve("SM");
		}
		else if (splitUrl[4] && splitUrl[4] == "globalSchema") {
			if (req.method === "PUT") {
				return Promise.resolve(["GS", "GS_" + splitUrl[5]]);
			}
			return Promise.resolve("GS");
		} else if (req.method === "PUT") {
			if (splitUrl[5] && (["start", "stop", "deploy", "repair"].indexOf(splitUrl[5]) > -1)) {
				return Promise.resolve(["SM", "SM_" + splitUrl[4]]);
			}
			else if (splitUrl[4] && splitUrl[4] == "service" && splitUrl[5]) return Promise.resolve(["SM", "SM_" + splitUrl[5]]);
		}
		else if (req.method === "DELETE" && (req.path.endsWith("purge/all") || req.path.endsWith("purge/log") || req.path.endsWith("purge/audit") || req.path.endsWith("draftDelete"))) {
			return Promise.resolve(["SM", "SM_" + splitUrl[4]]);
		}
		return Promise.resolve("SM");
	},
	getApp: (req) => {
		logger.debug(`[${req.headers.TxnId}] auth.js - /api/a/sm - getApp()`);
		let splitUrl = req.path.split("/");
		if (authUtil.compareUrl("/api/a/sm/{app}/service/start", req.path) || authUtil.compareUrl("/api/a/sm/{app}/service/stop", req.path)) {
			return Promise.resolve(splitUrl[4]);
		}
		let type = splitUrl[4] && splitUrl[4] == "globalSchema" ? "globalSchema" : "services";
		if (req.method === "GET") {
			let dom = req.query.filter ? JSON.parse(req.query.filter).app : null;
			if (dom) {
				return Promise.resolve(dom);
			} else {
				let serviceId = req.path.split("/").pop();
				return getServiceInfo(serviceId, type)
					.then(srvcInfo => {
						if (srvcInfo)
							return Promise.resolve(srvcInfo.app);
						return Promise.reject("Service " + serviceId + " not found");
					});
			}
		} else if (req.method === "DELETE" && !(req.path.endsWith("purge/all") || req.path.endsWith("purge/log") || req.path.endsWith("purge/audit") || req.path.endsWith("draftDelete") || req.path.endsWith("purge/author-audit"))) {
			logger.debug(`[${req.headers.TxnId}] ${type} :: DELETE `);
			let serviceId = req.path.split("/").pop();
			return getServiceInfo(serviceId, type)
				.then(srvcInfo => {
					logger.trace(`[${req.headers.TxnId}] srvcInfo - ${JSON.stringify(srvcInfo)}`);
					if (srvcInfo)
						return Promise.resolve(srvcInfo.app);
					throw new Error("Service " + serviceId + " not found");
				});
		}
		else if (req.method === "DELETE" && (req.path.endsWith("purge/all") || req.path.endsWith("purge/log") || req.path.endsWith("purge/audit") || req.path.endsWith("draftDelete") || req.path.endsWith("purge/author-audit"))) {
			logger.debug(`[${req.headers.TxnId}] ${type} :: DELETE with purge`);
			let serviceId = req.path.split("/")[4];

			return getServiceInfo(serviceId, type)
				.then(srvcInfo => {
					if (srvcInfo)
						return Promise.resolve(srvcInfo.app);
					throw new Error("Service " + serviceId + " not found");
				});
		} else if (req.method === "POST" || (req.method == "PUT" && req.path.startsWith("/api/a/sm/calendar"))) {
			let dom = req.body.app ? req.body.app : new Error("App not valid");
			return Promise.resolve(dom);
		} else if (req.method === "PUT") {
			let serviceId = null;
			if (req.path.startsWith("/api/a/sm/service") || req.path.startsWith("/api/a/sm/globalSchema")) {
				serviceId = req.path.split("/").pop();
			} else {
				let splitUrl = req.path.split("/");
				serviceId = splitUrl[splitUrl.length - 2];
			}
			return getServiceInfo(serviceId, type)
				.then(srvcInfo => {
					if (srvcInfo)
						return Promise.resolve(srvcInfo.app);
					throw new Error("Service " + serviceId + " not found");
				});
		}
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/pm/partner",
	getEntity: (req) => {
		let splitUrl = req.path.split("/");
		if (authUtil.compareUrl("/api/a/pm/partner/{id}", req.path)) {
			return Promise.resolve(["PM", `PM_${splitUrl[5]}`]);
		}
		return Promise.resolve("PM");
	},
	getApp: (req) => {
		let splitUrl = req.path.split("/");
		if (authUtil.compareUrl("/api/a/pm/partner/{id}", req.path)) {
			return global.mongoConnectionAuthor.collection("b2b.partners").findOne({ _id: splitUrl[5] }, { app: 1 })
				.then(_ptr => {
					if(!_ptr) throw new Error("partner is not valid");                    
					return _ptr.app;
				});
		}
		let app = null;
		if (authUtil.compareUrl("/api/a/pm/partner", req.path) && req.method == "POST") {
			app = req.body.app;
			return Promise.resolve(app);
		}

		app = req.query.filter ? JSON.parse(req.query.filter).app : null;
		if (!app) throw new Error("app required in filter");
		return Promise.resolve(app);
	}
},
{
	url: "/api/a/pm/nanoService",
	getEntity: (req) => {
		let splitUrl = req.path.split("/");
		if (authUtil.compareUrl("/api/a/pm/nanoService/{id}", req.path)) {
			return Promise.resolve(["NS", `NS_${splitUrl[5]}`]);
		}
		return Promise.resolve("NS");
	},
	getApp: (req) => {
		let splitUrl = req.path.split("/");
		if (authUtil.compareUrl("/api/a/pm/nanoService/{id}", req.path)) {
			return global.mongoConnectionAuthor.collection("b2b.nanoService").findOne({ _id: splitUrl[5] }, { app: 1 })
				.then(_ptr => {
					return _ptr.app;
				});
		}
		let app = null;
		if (authUtil.compareUrl("/api/a/pm/nanoService", req.path) && req.method == "POST") {
			app = req.body.app;
			return Promise.resolve(app);
		}
		if (authUtil.compareUrl("/api/a/pm/nanoService/{id}", req.path) && req.method == "PUT") {
			app = req.body.app;
			return Promise.resolve(app);
		}

		if(req.query.filter){
			let filter = JSON.parse(req.query.filter);
			if(filter.app){
				app = filter.app;
			}
			else if(filter.$and){
				app =  filter.$and[1].app;
			}
		}
		if (!app) throw new Error("app required in filter");
		return Promise.resolve(app);
	}
},
{
	url: "/api/a/rbac/group",
	getEntity: () => {
		return Promise.resolve("GROUP");
	},
	getApp: (req) => {
		if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE")
			return Promise.resolve(req.apiDetails.app);
	}
},
{
	url: "/api/a/rbac/usr",
	getEntity: () => {
		return Promise.resolve("User");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/rbac",
	getEntity: () => {
		return Promise.resolve("UM");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/ne",
	getEntity: () => {
		return Promise.resolve("NE");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/mon",
	getEntity: () => {
		return Promise.resolve("MON");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/sec",
	getEntity: () => {
		return Promise.resolve("SEC");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/a/de",
	getEntity: () => {
		return Promise.resolve("DE");
	},
	getApp: () => {
		return Promise.resolve(null);
	}
},
{
	url: "/api/c",
	getEntity: (req) => {
		let api = "/" + req.path.split("/")[4];
		let app = unescape(req.path.split("/")[3]);
		// return getServiceInfo(JSON.stringify({
		//     'api': api,
		//     'app': app
		// }), '_id', req)
		// TBD -> to make it map of id to avoid db query
		if(global.serviceIdMap[`${app}${api}`]) {
			return Promise.resolve(global.serviceIdMap[`${app}${api}`])
		} else {
			return global.mongoConnectionAuthor.collection("services").findOne({ "api": api, "app": app }, { _id: 1})
			.then(srvcInfo => {
				if (srvcInfo) {
					global.serviceIdMap[`${app}${api}`] = srvcInfo._id;
					return Promise.resolve(srvcInfo._id);
				} else {
					return Promise.resolve(null);
				}
			});
		}
	},
	getApp: () => {
		return Promise.resolve(null);
	}
}
];
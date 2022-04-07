let authUtil = require("./../../util/authUtil");

let logger = global.logger;

function isWorkflowInvalid(req) {
	if (req.user.isSuperAdmin) return false;
	let pathSegment = req.path.split("/");
	req.user.roles = req.user.roles.filter(r => r.entity);
	if (authUtil.compareUrl("/api/a/workflow/serviceList", req.path)) {
		logger.debug(JSON.stringify("req.user.roles -- ", req.user.roles));
		let serviceList = req.user.roles.filter(_r => _r.type == "appcenter" && !(_r.entity.startsWith("INTR") || _r.entity.startsWith("PM_"))).map(_r => _r.entity);
		if (req.query.filter) {
			let oldFilter = req.query.filter;
			req.query.filter = JSON.stringify({ "$and": [typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter), { serviceId: { "$in": serviceList } }] });
		} else {
			req.query.filter = JSON.stringify({ serviceId: { "$in": serviceList } });
		}
		return false;
	}
	if (authUtil.compareUrl("/api/a/workflow", req.path) || authUtil.compareUrl("/api/a/workflow/count", req.path)) {
		if (req.method === "GET") {
			let serviceList = req.user.roles.filter(_r => _r.type == "appcenter" && !(_r.entity.startsWith("INTR") || _r.entity.startsWith("PM_"))).map(_r => _r.entity);
			if (req.query.filter) {
				let oldFilter = req.query.filter;
				req.query.filter = JSON.stringify({ "$and": [typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter), { serviceId: { "$in": serviceList } }] });
			} else {
				req.query.filter = JSON.stringify({ serviceId: { "$in": serviceList } });
			}
			return false;
		}
		if (req.method === "POST") {
			return true;
		}
	}
	if (authUtil.compareUrl("/api/a/workflow/action", req.path)) {
		let serviceList = req.apiDetails.manageServiceList;
		let reqServiceList = req.apiDetails.map(_a => _a.serviceId);
		logger.debug(JSON.stringify({ serviceList, reqServiceList }));
		return !reqServiceList.every(_s => serviceList.indexOf(_s) > -1);
	}
	if (authUtil.compareUrl("/api/a/workflow/{id}", req.path) || authUtil.compareUrl("/api/a/workflow/doc/{id}", req.path)) {
		let serviceList = [];
		if (req.method === "GET")
			serviceList = req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.entity);
		else {
			serviceList = req.apiDetails.manageServiceList;
		}
		return serviceList.indexOf(req.apiDetails.serviceId) === -1;
	}
	if (authUtil.compareUrl("/api/a/workflow/group/{app}", req.path)) {
		let appList = req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.app);
		return appList.indexOf(pathSegment[5]) === -1;
	}
}

function wfAuthorizationMw(req, res, next) {

    if (isWorkflowInvalid(req)) {
        res.status(403).json({ message: "Access denied" });
        return next(new Error("Access denied"));
    }
    return authUtil.checkRecordPermissionForUserWF(req)
        .then(() => {
            return next();
        })
        .catch(err => {
            logger.error('Error in wfAuthorizationMw :: ', err);
            next(err);
        });
}

module.exports = wfAuthorizationMw;
const e = {};

e.MONGO_AUTHOR_URL = process.env.MONGO_AUTHOR_URL || 'mongodb://localhost';
e.MONGO_AUTHOR_DBNAME = process.env.MONGO_AUTHOR_DBNAME || 'datastackConfig';
e.MONGO_LOGS_URL = process.env.MONGO_LOGS_URL || 'mongodb://localhost';
e.MONGO_LOGS_DBNAME = process.env.MONGO_LOGS_DBNAME || 'datastackLogs';
e.MONGO_APPCENTER_URL = process.env.MONGO_APPCENTER_URL || 'mongodb://localhost';
e.isK8sEnv = () => {
	return process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT;
};
e.IMAGE_TAG = process.env.IMAGE_TAG;
e.LOG_LEVEL = process.env.LOG_LEVEL;
e.DATA_STACK_NAMESPACE = process.env.DATA_STACK_NAMESPACE || 'appveen';
e.MODE = process.env.MODE || 'PROD';
e.defaultAllowedFileTypes = 'ppt,xls,csv,doc,jpg,jpeg,png,gif,zip,tar,rar,gz,bz2,7z,mp4,mp3,pdf,ico,docx,pptx,xlsx,ods,xml';
e.roleCacheExpiry = 60 * 60 * 8;
e.validationCacheExpiry = 60 * 60 * 8;

module.exports = e;
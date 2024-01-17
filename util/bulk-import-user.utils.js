const router = require('express').Router();
const FileType = require('file-type');
const { parseFile, writeToString } = require('fast-csv');
const { ObjectId } = require('mongodb');

let logger = global.logger;
router.get('/api/a/rbac/:app/user/utils/bulkCreate/template', async function (req, res) {
	const templateData = [
		['Name [Required for local Auth Mode]', 'Username [Email]', 'Password [Required for local Auth Mode]', 'Auth Mode [local/azure/ldap]'],
		['John Doe', 'johndoe@datastack.com', 'thisisapassword', 'local'],
	];
	const csvString = await writeToString(templateData);
	if (req.header('content-type') !== 'application/json') {
		res.header('Content-Disposition', 'attachment; filename="data-stack-users-template.csv"');
		res.write(csvString);
		res.end();
	} else {
		res.status(200).json({ csvString });
	}
});


router.post('/api/a/rbac/:app/user/utils/bulkCreate/upload', async function (req, res) {
	try {
		logger.debug('File upload hander :: upload()');
		logger.debug(`File metadata :: ${JSON.stringify(req.file)}`);
		if (!req.file) return res.status(400).send('No files were uploaded.');
		const fileId = `tmp-${Date.now()}`;
		const fileName = req.file.originalname;
		const app = req.params.app;
		req.file.fileId = fileId;
		logger.debug(`File id of ${req.file.originalname} :: ${req.file.fileId}`);
		const fileExtn = req.file.originalname.split('.').pop();
		const actualExt = await FileType.fromFile(req.file.path);
		if (!actualExt && fileExtn != 'csv') {
			throw 'Unsupported FileType';
		}
		const collectionName = 'userMgmt.users';
		parseFile(req.file.path, { headers: false, skipRows: 1 }).on('error', (err) => {
			logger.error(err);
			res.status(400).json({
				'message': err
			});
		}).on('data', async (row) => {
			const user = {
				name: row[0],
				username: row[1],
				password: row[2],
				type: row[3]
			};
			const data = {
				_id: ObjectId.generate(),
				fileId,
				data: user,
				app,
				status: 'Uploaded',
				_metadata: {
					version: {
						document: 1
					},
					deleted: false,
					lastUpdated: new Date(),
					createdAt: new Date()
				}
			};
			await global.mongoConnectionAuthor.collection(`${collectionName}.bulkCreate`).insert(data);
		}).on('end', async () => {
			try {
				const payload = {
					_id: fileId,
					app,
					status: 'Pending',
					fileName: fileName,
					_metadata: {
						version: {
							document: 1
						},
						deleted: false,
						lastUpdated: new Date(),
						createdAt: new Date()
					}
				};
				await global.mongoConnectionAuthor.collection(`${collectionName}.fileTransfers`).insert(payload);
				res.status(200).json(payload);
			} catch (err) {
				logger.error(err);
				res.status(400).json({
					'message': err
				});
			}
		});
	} catch (err) {
		logger.error(err);
		res.status(400).json({
			'message': err
		});
	}
});

module.exports = router;
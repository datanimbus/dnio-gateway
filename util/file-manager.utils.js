const mongoose = require('mongoose');
const log4js = require('log4js');
const { S3Client, uplo } = require('@aws-sdk/client-s3');
const { BlobServiceClient } = require('@azure/storage-blob');
const { Storage } = require('@google-cloud/storage');


const { getVariables } = require('../config/config.vars');

const logger = log4js.getLogger(global.loggerName);

const fileSchema = new mongoose.Schema({
	originalname: String,
	mimetype: String,
	size: Number,
	uploadedAt: { type: Date, default: Date.now },
});

const FileModel = mongoose.model('files', fileSchema);

const s3client = new S3Client({
	accessKeyId: 'your-access-key-id',
	secretAccessKey: 'your-secret-access-key',
});

const azureBlobServiceClient = BlobServiceClient.fromConnectionString('your-azure-connection-string');
const azureContainerClient = azureBlobServiceClient.getContainerClient('your-container-name');

const gcsClient = new Storage({
	projectId: 'your-project-id',
	keyFilename: 'path-to-your-key-file.json',
});


async function uploadFileHandler(req, res) {
	try {
		let envVars = await getVariables();
		const file = req.files.file;
		const fileName = `${Date.now()}-${file.name}`;
		switch (envVars.FILE_STORAGE.toLowerCase()) {
			case 's3':
				// Stream upload to S3
				const s3Params = {
					Bucket: 'your-s3-bucket-name',
					Key: fileName,
					Body: file.data,
				};
				await s3client.send().upload(s3Params).promise();
				break;

			case 'azure':
				// Stream upload to Azure Blob Storage
				const azureBlockBlobClient = azureContainerClient.getBlockBlobClient(fileName);
				await azureBlockBlobClient.uploadStream(file.data, file.data.length, 4, undefined, {
					blobHTTPHeaders: { blobContentType: file.mimetype },
				});
				break;

			case 'gcs':
				// Stream upload to Google Cloud Storage
				const bucket = gcs.bucket('your-gcs-bucket-name');
				const fileGCS = bucket.file(fileName);
				const writeStream = fileGCS.createWriteStream({
					metadata: {
						contentType: file.mimetype,
					},
				});
				writeStream.end(file.data);
				await new Promise((resolve, reject) => {
					writeStream.on('finish', resolve);
					writeStream.on('error', reject);
				});
				break;

			default:
				// Save to local disk
				const localFilePath = `uploads/${fileName}`;
				await file.mv(localFilePath);
		}
		const fileRecord = new FileModel({
			originalname: file.name,
			mimetype: file.mimetype,
			size: file.size,
		});
		await fileRecord.save();
	} catch (err) {
		logger.error('Error in uploadFileHandler :: ', err);
	}

}


async function downloadFileHandler(req, res) {
	try {
		let envVars = await getVariables();
	} catch (err) {
		logger.error('Error in downloadFileHandler :: ', err);
	}
}

module.exports.uploadFileHandler = uploadFileHandler;
module.exports.downloadFileHandler = downloadFileHandler;
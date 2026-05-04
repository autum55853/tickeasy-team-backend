// import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
// import { Buffer } from 'buffer';
// import sharp from 'sharp';
// import { v4 as uuidv4 } from 'uuid';
// import createHttpError from 'http-errors';
// import { UploadContext, UploadImageParams, UploadImageResult } from '../types/upload/index.js';

// // AWS S3 客戶端初始化
// const s3Client = new S3Client({
//   region: process.env.AWS_REGION || 'ap-northeast-1',
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
//   },
// });


// /**
//  * 根據上傳上下文確定儲存的 bucket 前綴
//  */
// function getBucketPrefix(uploadContext: UploadContext): string {
//   switch (uploadContext) {
//     case 'USER_AVATAR':
//       return 'avatar';
//     case 'VENUE_PHOTO':
//       return 'venue';
//     case 'CONCERT_SEATING_TABLE':
//     case 'CONCERT_BANNER':
//       return 'concert';
//     default:
//       throw new Error(`Invalid upload context provided: ${uploadContext}`);
//   }
// }

// /**
//  * 根據上傳上下文和目標 ID 建立儲存路徑
//  */
// function getStoragePath(uploadContext: UploadContext, targetId: string | number | undefined, fileExtension: string, isTemporary: boolean = false): string {
//   const fileName = `${uuidv4()}${fileExtension}`;
//   const prefix = getBucketPrefix(uploadContext);
  
//   // 如果沒有 targetId 或明確標示為臨時檔案，則視為暫存圖片
//   if (targetId === undefined || isTemporary) {
//     return `${prefix}/temp/${uploadContext.toLowerCase()}/${fileName}`;
//   }
  
//   switch (uploadContext) {
//     case 'USER_AVATAR':
//       return `${prefix}/${targetId}/${fileName}`;
//     case 'VENUE_PHOTO':
//       return `${prefix}/${targetId}/${fileName}`;
//     case 'CONCERT_SEATING_TABLE':
//       return `${prefix}/${targetId}/seatTable/${fileName}`;
//     case 'CONCERT_BANNER':
//       return `${prefix}/${targetId}/banner/${fileName}`;
//     default:
//       throw new Error(`Invalid upload context provided: ${uploadContext}`);
//   }
// }

// /**
//  * 處理並優化圖片（與原本相同）
//  */
// async function processImage(
//   fileBuffer: Buffer,
//   mimetype: string,
//   options: UploadImageParams['options'] = {}
// ): Promise<{ buffer: Buffer; info: sharp.OutputInfo; format: string }> {
//   const defaultOptions = {
//     maxWidth: 1920,
//     maxHeight: 1080,
//     quality: 80,
//     format: 'webp' as const,
//   };

//   const settings = { ...defaultOptions, ...options };
  
//   let sharpInstance = sharp(fileBuffer);
//   const metadata = await sharpInstance.metadata();
  
//   if (metadata.width && metadata.width > settings.maxWidth) {
//     sharpInstance = sharpInstance.resize({
//       width: settings.maxWidth,
//       height: settings.maxHeight,
//       fit: 'inside',
//       withoutEnlargement: true,
//     });
//   }

//   if (settings.format === 'webp') {
//     sharpInstance = sharpInstance.webp({ quality: settings.quality });
//   } else if (settings.format === 'jpeg') {
//     sharpInstance = sharpInstance.jpeg({ quality: settings.quality });
//   } else if (settings.format === 'png') {
//     sharpInstance = sharpInstance.png({ quality: settings.quality });
//   }

//   const { data, info } = await sharpInstance.toBuffer({ resolveWithObject: true });
  
//   return {
//     buffer: data,
//     info,
//     format: settings.format,
//   };
// }


// /**
//  * 上傳圖片到 AWS S3
//  */
// async function uploadImage(params: UploadImageParams): Promise<UploadImageResult> {
//   const { fileBuffer, mimetype, uploadContext, targetId, isTemporary = false } = params;
  
//   if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
//     throw createHttpError(500, 'AWS 環境變數未設定');
//   }

//   try {
//     // 1. 處理並優化圖片
//     const { buffer, info, format } = await processImage(fileBuffer, mimetype, params.options);

//     // 2. 確定檔案副檔名和 MIME 類型
//     const fileExtension = `.${format}`;
//     const contentType = `image/${format}`;

//     // 3. 確定儲存路徑
//     const key = getStoragePath(uploadContext, targetId, fileExtension, isTemporary);

//     // 4. 上傳到 S3
//     const uploadCommand = new PutObjectCommand({
//       Bucket: S3_BUCKET,
//       Key: key,
//       Body: buffer,
//       ContentType: contentType,
//       CacheControl: 'max-age=31536000', // 1年快取
//     });

//     await s3Client.send(uploadCommand);

//     // 5. 生成公開 URL
//     const publicUrl = getPublicUrl(key);

//     // 6. 回傳結果
//     return {
//       url: publicUrl,
//       path: key, // S3 中的 key 就是 path
//       width: info.width,
//       height: info.height,
//       size: info.size,
//       format,
//       isTemporary
//     };
//   } catch (err) {
//     console.error('處理或上傳圖片時出錯:', err);
//     if (err instanceof Error) {
//       throw createHttpError(500, `圖片處理或上傳失敗: ${err.message}`);
//     }
//     throw createHttpError(500, '圖片處理或上傳失敗');
//   }
// }

// /**
//  * 從 S3 刪除圖片
//  */
// async function deleteImage(key: string): Promise<boolean> {
//   if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
//     throw createHttpError(500, 'AWS 環境變數未設定');
//   }

//   try {
//     const deleteCommand = new DeleteObjectCommand({
//       Bucket: S3_BUCKET,
//       Key: key,
//     });

//     await s3Client.send(deleteCommand);
//     return true;
//   } catch (err) {
//     console.error('刪除圖片時出錯:', err);
//     if (err instanceof Error) {
//       throw createHttpError(500, `刪除圖片失敗: ${err.message}`);
//     }
//     throw createHttpError(500, '刪除圖片失敗');
//   }
// }

// /**
//  * 清理暫存圖片
//  */
// async function cleanupTempImages(hours: number = 24): Promise<number> {
//   if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
//     throw createHttpError(500, 'AWS 環境變數未設定');
//   }

//   try {
//     const prefixes = ['avatar/temp/', 'venue/temp/', 'concert/temp/'];
//     let totalDeleted = 0;

//     for (const prefix of prefixes) {
//       // 列出暫存檔案
//       const listCommand = new ListObjectsV2Command({
//         Bucket: S3_BUCKET,
//         Prefix: prefix,
//       });

//       const response = await s3Client.send(listCommand);
      
//       if (!response.Contents || response.Contents.length === 0) {
//         console.log(`${prefix} 中沒有暫存檔案`);
//         continue;
//       }

//       // 計算時間閾值
//       const threshold = new Date();
//       threshold.setHours(threshold.getHours() - hours);

//       // 篩選出過期檔案
//       const filesToDelete = response.Contents.filter(obj => {
//         if (!obj.LastModified || !obj.Key) return false;
//         return obj.LastModified < threshold;
//       });

//       if (filesToDelete.length === 0) {
//         console.log(`${prefix} 中沒有過期的暫存檔案`);
//         continue;
//       }

//       // 批次刪除過期檔案
//       for (const file of filesToDelete) {
//         if (file.Key) {
//           await deleteImage(file.Key);
//           totalDeleted++;
//         }
//       }

//       console.log(`已從 ${prefix} 中刪除 ${filesToDelete.length} 個暫存檔案`);
//     }

//     return totalDeleted;
//   } catch (err) {
//     console.error('清理暫存圖片時出錯:', err);
//     if (err instanceof Error) {
//       throw createHttpError(500, `清理暫存圖片失敗: ${err.message}`);
//     }
//     throw createHttpError(500, '清理暫存圖片失敗');
//   }
// }

// export default {
//   uploadImage,
//   deleteImage,
//   cleanupTempImages,
// }; 
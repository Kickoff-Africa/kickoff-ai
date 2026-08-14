import { v2 as cloudinary } from 'cloudinary'
import { config } from '../config/env'

cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
})

/**
 * Upload a file buffer to Cloudinary.
 * Returns the secure URL of the uploaded asset.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    originalname: string
    mimetype: string
    folder?: string
  },
): Promise<string> {
  const resourceType = options.mimetype.startsWith('image/') ? 'image' : 'raw'

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: options.folder ?? 'kickoff-ai/attachments',
        use_filename: true,
        unique_filename: true,
        // PDFs and raw files: preserve the original extension so the URL is readable
        format: resourceType === 'raw' ? undefined : undefined,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve(result.secure_url)
      },
    )
    stream.end(buffer)
  })
}

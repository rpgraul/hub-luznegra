// supabase/functions/r2-storage/index.ts
// Edge Function para upload e gestão de arquivos no Cloudflare R2 com S3Client (com fallback para Supabase Storage)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3'
import { json, handleOptions } from '../_shared/cors.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface UploadPayload {
  action: 'upload' | 'delete'
  fileName?: string
  fileType?: string
  fileBase64?: string
  fileKey?: string
}

Deno.serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user) {
      return json({ error: 'Sessão inválida.' }, 401)
    }

    const payload: UploadPayload = await req.json()
    const { action } = payload

    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID') || 'bb029ed83fcd48e5c722d6b984bf3a44'
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || ''
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || ''
    const r2BucketName = Deno.env.get('R2_BUCKET_NAME') || 'hub-luznegra-docs'
    const r2PublicUrl = (Deno.env.get('R2_PUBLIC_URL') || '').replace(/\/+$/, '')

    const hasR2Config = !!(r2AccountId && r2AccessKeyId && r2SecretAccessKey)

    if (action === 'upload') {
      const { fileName, fileType = 'application/octet-stream', fileBase64 } = payload
      if (!fileName || !fileBase64) {
        return json({ error: 'Parâmetros de arquivo inválidos.' }, 400)
      }

      const binaryString = atob(fileBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const objectKey = `documents/${Date.now()}_${safeName}`

      if (hasR2Config) {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
          },
        })

        await s3.send(
          new PutObjectCommand({
            Bucket: r2BucketName,
            Key: objectKey,
            Body: bytes,
            ContentType: fileType,
          }),
        )

        const downloadUrl = r2PublicUrl
          ? `${r2PublicUrl}/${objectKey}`
          : `https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${objectKey}`

        return json({
          success: true,
          provider: 'r2',
          fileKey: objectKey,
          fileUrl: downloadUrl,
        })
      } else {
        // Fallback automático para Supabase Storage (bucket 'documents')
        await admin.storage.createBucket('documents', { public: true }).catch(() => {})

        const { error: uploadError } = await admin.storage
          .from('documents')
          .upload(objectKey, bytes, {
            contentType: fileType,
            upsert: true,
          })

        if (uploadError) {
          throw new Error(`Falha no upload: ${uploadError.message}`)
        }

        const { data: publicUrlData } = admin.storage
          .from('documents')
          .getPublicUrl(objectKey)

        return json({
          success: true,
          provider: 'supabase-storage',
          fileKey: objectKey,
          fileUrl: publicUrlData.publicUrl,
        })
      }
    } else if (action === 'delete') {
      const { fileKey } = payload
      if (!fileKey) {
        return json({ error: 'Chave de arquivo não informada.' }, 400)
      }

      if (hasR2Config) {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
          },
        })

        await s3.send(
          new DeleteObjectCommand({
            Bucket: r2BucketName,
            Key: fileKey,
          }),
        )
      } else {
        await admin.storage.from('documents').remove([fileKey]).catch(() => {})
      }

      return json({ success: true })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (err) {
    console.error('Erro na função r2-storage:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno.' }, 500)
  }
})

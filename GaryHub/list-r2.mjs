import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: 'https://be3d95c2f0211bfc68b26e41ef1a3366.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '4ae12cf342ca028251b16a3beed0fd72',
    secretAccessKey: 'fee331af2642b2cfa0440f377ae2d9d19c7cb0389a03d3503d86d003a621dca5'
  }
});

const r = await client.send(new ListObjectsV2Command({ Bucket: 'garyhub', MaxKeys: 1000 }));
console.log(JSON.stringify((r.Contents || []).map(o => o.Key), null, 2));

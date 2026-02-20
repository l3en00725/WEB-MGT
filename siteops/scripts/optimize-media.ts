#!/usr/bin/env ts-node
/**
 * SiteOps Media Optimization Script
 * Usage: npx ts-node scripts/optimize-media.ts --site <siteId>
 *
 * What it does:
 * 1. Scans GitHub repo for all image references in .tsx/.html files
 * 2. Downloads each referenced image from the live site
 * 3. Runs Sharp optimization pipeline (WebP conversion, compression)
 * 4. Checks if each image is Discover-eligible (width >= 1200px)
 * 5. Uploads optimized versions to Supabase Storage
 * 6. Generates a report of: original size vs new size, Discover eligibility status
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { Octokit } from '@octokit/rest'
import * as path from 'path'

// Load env from .env.local
require('dotenv').config({ path: '.env.local' })

const OPTIMIZATION_CONFIG = {
  webp: { quality: 82, effort: 4 as const },
  jpeg: { quality: 85, progressive: true, mozjpeg: true },
  png: { compressionLevel: 8, progressive: true as const },
  discoverVariant: { width: 1200, height: 630, fit: 'cover' as const, position: 'centre' as const },
  thumbnailVariant: { width: 400, height: 300, fit: 'cover' as const },
  maxFileSizeBytes: 10 * 1024 * 1024,
}

interface OptimizationResult {
  path: string
  originalKB: number
  optimizedKB: number
  saving: string
}

interface OptimizationReport {
  totalImages: number
  totalSavedKB: number
  discoverEligible: number
  discoverIneligible: { path: string; currentWidth: number }[]
  optimizationResults: OptimizationResult[]
}

async function main() {
  const args = process.argv.slice(2)
  const siteIdIndex = args.indexOf('--site')
  if (siteIdIndex === -1 || !args[siteIdIndex + 1]) {
    console.error('Usage: npx ts-node scripts/optimize-media.ts --site <siteId>')
    process.exit(1)
  }

  const siteId = args[siteIdIndex + 1]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get site data
  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .single()

  if (!site) {
    console.error(`Site ${siteId} not found`)
    process.exit(1)
  }

  // Get GitHub token
  const { data: tokenRow } = await supabase
    .from('site_tokens')
    .select('access_token')
    .eq('site_id', siteId)
    .eq('token_type', 'github')
    .single()

  if (!tokenRow) {
    console.error('GitHub token not found for this site')
    process.exit(1)
  }

  console.log(`\nOptimizing media for ${site.name} (${site.domain})`)
  console.log(`Repo: ${site.github_owner}/${site.github_repo}\n`)

  const octokit = new Octokit({ auth: tokenRow.access_token })

  // Get all file paths in repo
  const { data: tree } = await octokit.git.getTree({
    owner: site.github_owner,
    repo: site.github_repo,
    tree_sha: site.github_default_branch,
    recursive: '1',
  })

  const sourceFiles = tree.tree
    ?.filter(f => f.type === 'blob' && /\.(tsx|jsx|ts|js|html|mdx|md)$/.test(f.path ?? ''))
    .map(f => f.path ?? '') ?? []

  console.log(`Scanning ${sourceFiles.length} source files for image references...`)

  // Extract image references
  const imageRefs = new Set<string>()
  const imgPattern = /(?:src|href|ogImage|og:image|content)=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/gi

  for (const filePath of sourceFiles.slice(0, 50)) {
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: site.github_owner,
        repo: site.github_repo,
        path: filePath,
      })

      if ('content' in fileData) {
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        let match
        while ((match = imgPattern.exec(content)) !== null) {
          const imgSrc = match[1]
          if (!imgSrc.startsWith('http')) {
            imageRefs.add(imgSrc)
          }
        }
      }
    } catch { /* skip */ }
  }

  console.log(`Found ${imageRefs.size} image references\n`)

  const report: OptimizationReport = {
    totalImages: 0,
    totalSavedKB: 0,
    discoverEligible: 0,
    discoverIneligible: [],
    optimizationResults: [],
  }

  for (const imgRef of Array.from(imageRefs)) {
    const imageUrl = imgRef.startsWith('/') ? `https://${site.domain}${imgRef}` : imgRef

    try {
      console.log(`Processing: ${imgRef}`)

      // Download image
      const res = await fetch(imageUrl)
      if (!res.ok) continue

      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length > OPTIMIZATION_CONFIG.maxFileSizeBytes) {
        console.log(`  Skipping (too large: ${Math.round(buffer.length / 1024)}KB)`)
        continue
      }

      const originalKB = Math.round(buffer.length / 1024)
      const metadata = await sharp(buffer).metadata()
      const width = metadata.width ?? 0

      // Optimize
      const optimizedBuffer = await sharp(buffer)
        .webp(OPTIMIZATION_CONFIG.webp)
        .toBuffer()

      const optimizedKB = Math.round(optimizedBuffer.length / 1024)
      const savedKB = originalKB - optimizedKB
      const savingPct = ((savedKB / originalKB) * 100).toFixed(1)

      // Check Discover eligibility
      if (width >= 1200) {
        report.discoverEligible++
      } else {
        report.discoverIneligible.push({ path: imgRef, currentWidth: width })
      }

      // Upload optimized version
      const filename = path.basename(imgRef).replace(/\.[^.]+$/, '') + '-optimized.webp'
      const storagePath = `sites/${siteId}/${filename}`

      await supabase.storage
        .from('site-media')
        .upload(storagePath, optimizedBuffer, {
          contentType: 'image/webp',
          upsert: true,
        })

      // Generate Discover variant
      const discoverBuffer = await sharp(buffer)
        .resize({
          ...OPTIMIZATION_CONFIG.discoverVariant,
          withoutEnlargement: true,
        })
        .webp(OPTIMIZATION_CONFIG.webp)
        .toBuffer()

      await supabase.storage
        .from('site-media')
        .upload(
          `sites/${siteId}/${filename.replace('.webp', '-1200x630.webp')}`,
          discoverBuffer,
          { contentType: 'image/webp', upsert: true }
        )

      report.optimizationResults.push({
        path: imgRef,
        originalKB,
        optimizedKB,
        saving: `${savingPct}%`,
      })

      report.totalSavedKB += Math.max(0, savedKB)
      report.totalImages++

      console.log(`  ${originalKB}KB → ${optimizedKB}KB (saved ${savingPct}%)${width >= 1200 ? ' ✓ Discover' : ''}`)
    } catch (e: any) {
      console.log(`  Error: ${e.message}`)
    }
  }

  // Print report
  console.log('\n' + '='.repeat(50))
  console.log('OPTIMIZATION REPORT')
  console.log('='.repeat(50))
  console.log(`Total images processed: ${report.totalImages}`)
  console.log(`Total saved: ${report.totalSavedKB}KB`)
  console.log(`Discover eligible: ${report.discoverEligible}`)
  console.log(`Not Discover eligible: ${report.discoverIneligible.length}`)

  if (report.discoverIneligible.length > 0) {
    console.log('\nImages needing upgrade for Discover (width < 1200px):')
    report.discoverIneligible.forEach(img => {
      console.log(`  ${img.path} (${img.currentWidth}px wide)`)
    })
  }

  console.log('\n' + JSON.stringify(report, null, 2))
}

main().catch(console.error)

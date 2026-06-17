import * as React from 'react'
import { Card, CardContent, Typography, Box, Skeleton } from '@mui/material'
import type { SvgIconComponent } from '@mui/icons-material'
import Link from 'next/link'

interface StatCardProps {
  title: string
  value: number | string | undefined
  icon: SvgIconComponent
  color?: string
  subtitle?: string
  loading?: boolean
  /** When set, the whole card becomes a link to this route. */
  href?: string
}

export function StatCard({ title, value, icon: Icon, color = 'primary.main', subtitle, loading, href }: StatCardProps) {
  const card = (
    <Card
      sx={
        href
          ? { height: '100%', transition: 'box-shadow .2s', cursor: 'pointer', '&:hover': { boxShadow: 4 } }
          : { height: '100%' }
      }
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            {loading ? (
              <Skeleton width={60} height={40} />
            ) : (
              <Typography variant="h4" fontWeight={700}>{value ?? '—'}</Typography>
            )}
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}18` }}>
            <Icon sx={{ fontSize: 32, color }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {card}
      </Link>
    )
  }
  return card
}

import * as React from 'react'
import { Card, CardContent, Typography, Box, Skeleton } from '@mui/material'
import type { SvgIconComponent } from '@mui/icons-material'

interface StatCardProps {
  title: string
  value: number | string | undefined
  icon: SvgIconComponent
  color?: string
  subtitle?: string
  loading?: boolean
}

export function StatCard({ title, value, icon: Icon, color = 'primary.main', subtitle, loading }: StatCardProps) {
  return (
    <Card>
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
}

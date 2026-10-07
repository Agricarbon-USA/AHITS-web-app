'use client'

import * as React from 'react'
import {
  Box, Paper, Skeleton, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, Typography,
} from '@mui/material'
import { PAGE_SIZE_OPTIONS } from '@/hooks/useListQuery'

/**
 * PR-1a (RC-2 / D-h): the one paged table. Everything it renders is a fact the
 * server sent — the range caption reads the real `total`, never the length of
 * whatever happened to be fetched, which is the habit this primitive exists to
 * end (L-1/L-3/L-6).
 *
 * The caption and the pager live INSIDE the bordered `Paper`, so "Showing 1–100
 * of 160" cannot be mistaken for page chrome belonging to something else, and
 * the pager can never scroll out of sight of the rows it drives.
 *
 * `truncated` with no further page (a hard server cap, or a clamped pageSize)
 * says so in words. A list that is cut off and says nothing is the bug.
 */

export interface PagedTableProps {
  /** The `<TableRow>` of `<TableCell>` headers. */
  head: React.ReactNode
  /** The body rows. */
  children: React.ReactNode
  total: number
  /** 0-based, as `useListQuery` and MUI both use. */
  page: number
  pageSize: number
  truncated?: boolean
  loading?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  /** Column count — used by the skeleton and empty rows. */
  colSpan: number
  /** Rendered in place of rows when the list is empty and not loading. */
  emptyMessage?: React.ReactNode
  /** Skeleton rows while loading. Default 6. */
  skeletonRows?: number
  /** Noun for the caption: "Showing 1–100 of 160 items". Omit for no noun. */
  itemNoun?: string
  tableProps?: React.ComponentProps<typeof Table>
}

export function PagedTable({
  head,
  children,
  total,
  page,
  pageSize,
  truncated = false,
  loading = false,
  onPageChange,
  onPageSizeChange,
  colSpan,
  emptyMessage,
  skeletonRows = 6,
  itemNoun,
  tableProps,
}: PagedTableProps) {
  // `Children.count` counts a `false`/`null` child as one, so a page whose rows
  // are `{cond && […]}` would never look empty. `toArray` drops those and flattens.
  const rowCount = React.Children.toArray(children).length
  // Derived from the SERVER's numbers only — never from how many rows happened
  // to render, which is the arithmetic that made a capped list look complete.
  const first = total === 0 ? 0 : page * pageSize + 1
  const last = Math.min(total, (page + 1) * pageSize)
  const noun = itemNoun ? ` ${itemNoun}` : ''
  const caption = total === 0
    ? `No${noun || ' rows'} to show`
    : `Showing ${first}–${last} of ${total}${noun}`
  // Only worth saying on the last page — mid-list, "more" is the pager's job.
  const showTruncationNote = truncated && (page + 1) * pageSize >= total

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" {...tableProps}>
        <TableHead>{head}</TableHead>
        <TableBody>
          {loading && Array.from({ length: skeletonRows }).map((_, i) => (
            <TableRow key={`__skeleton__${i}`}>
              <TableCell colSpan={colSpan}><Skeleton height={24} /></TableCell>
            </TableRow>
          ))}
          {!loading && rowCount === 0 && emptyMessage !== undefined && (
            <TableRow>
              <TableCell colSpan={colSpan} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {!loading && children}
        </TableBody>
      </Table>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 1, px: 2, py: 0.5,
          borderTop: '1px solid', borderColor: 'divider',
        }}
      >
        <Box>
          {/* `total` is 0 until the first response lands, so captioning during
              that load would print "No rows to show" under the skeletons. */}
          <Typography variant="caption" color="text.secondary">
            {loading && total === 0 ? 'Loading…' : caption}
          </Typography>
          {showTruncationNote && (
            <Typography variant="caption" color="warning.main" display="block">
              This list is capped — not every matching row is shown. Narrow the filters to see the rest.
            </Typography>
          )}
        </Box>
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
          showFirstButton
          showLastButton
          onPageChange={(_, p) => onPageChange(p)}
          onRowsPerPageChange={(e) => onPageSizeChange(Number(e.target.value))}
          sx={{ borderBottom: 'none' }}
        />
      </Box>
    </TableContainer>
  )
}

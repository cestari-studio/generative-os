/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeDocumentRows,
  buildMediaObjectRows,
  buildStorageScopePrefix,
  formatContentSize,
  getIndexingStatusTagType,
  interpretIngestionResult,
  requireUploadedObjectPath,
} from '../data/knowledgePresentation';

describe('knowledge presentation helpers do not fabricate backend metadata', () => {
  test('missing document scope, language, and indexing status remain not reported', () => {
    expect(buildKnowledgeDocumentRows([{ id: 'doc-1', name: 'Notes' }])).toEqual([
      {
        id: 'doc-1',
        name: 'Notes',
        visibility_scope: 'Not reported',
        in_language: 'Not reported',
        indexing_status: 'Not reported',
      },
    ]);
  });

  test('missing metadata does not create a media name, bucket, MIME type, or size', () => {
    expect(buildMediaObjectRows([{ id: 'media-1' }])).toEqual([
      {
        id: 'media-1',
        name: 'Not reported',
        bucket_id: 'Not reported',
        encoding_format: 'Not reported',
        content_size: 'Not reported',
      },
    ]);
  });

  test('zero-byte files remain zero and small files do not inflate to one kilobyte', () => {
    expect(formatContentSize(0)).toBe('0 KB');
    expect(formatContentSize(100)).toBe('0.1 KB');
    expect(formatContentSize(1024)).toBe('1 KB');
  });

  test('missing and invalid sizes are not assigned a synthetic size', () => {
    expect(formatContentSize(null)).toBe('Not reported');
    expect(formatContentSize('')).toBe('Not reported');
    expect(formatContentSize(-10)).toBe('Not reported');
    expect(formatContentSize('unknown')).toBe('Not reported');
  });

  test('indexing color reflects the actual status rather than always showing success', () => {
    expect(getIndexingStatusTagType('ready')).toBe('green');
    expect(getIndexingStatusTagType('failed')).toBe('red');
    expect(getIndexingStatusTagType('processing')).toBe('blue');
    expect(getIndexingStatusTagType('Not reported')).toBe('warm-gray');
  });

  test('ingestion result preserves a reported zero and never invents a minimum chunk count', () => {
    expect(interpretIngestionResult({ document: { id: 'doc-1', name: 'Notes' }, chunksIndexed: 0 })).toEqual({
      status: 'reported',
      documentName: 'Notes',
      chunksIndexed: 0,
    });
  });

  test('ingestion results without persisted identity or count remain unverified', () => {
    expect(interpretIngestionResult({ chunksIndexed: 1 })).toEqual({ status: 'unverified' });
    expect(interpretIngestionResult({ document: { id: 'doc-1', name: 'Notes' } })).toEqual({
      status: 'persisted_without_count',
      documentName: 'Notes',
    });
  });

  test('storage prefix is shown only when organization and workspace IDs are available', () => {
    expect(buildStorageScopePrefix('org-1', 'ws-1')).toBe('org-1/ws-1/');
    expect(buildStorageScopePrefix(null, 'ws-1')).toBeNull();
    expect(buildStorageScopePrefix('org-1', null)).toBeNull();
  });

  test('media table preserves explicit zero bytes', () => {
    expect(buildMediaObjectRows([{ id: 'media-1', content_size: 0 }])[0].content_size).toBe('0 KB');
  });

  test('storage upload must return a real persisted object path before metadata may be written', () => {
    expect(requireUploadedObjectPath({ data: { path: 'org-1/ws-1/object.pdf' }, error: null })).toBe(
      'org-1/ws-1/object.pdf',
    );
    expect(() => requireUploadedObjectPath({ data: null, error: null })).toThrow(
      'Storage upload did not return a persisted object path.',
    );
    expect(() =>
      requireUploadedObjectPath({ data: null, error: new Error('storage permission denied') }),
    ).toThrow('storage permission denied');
  });
});

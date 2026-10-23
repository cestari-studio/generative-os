/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  CodeSnippet,
  Column,
  DataTable,
  FileUploaderDropContainer,
  Form,
  Grid,
  InlineNotification,
  Layer,
  Search,
  Select,
  SelectItem,
  Slider,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { DocumentAdd, Folder, Search as SearchIcon, Upload } from '@carbon/icons-react';
import { PageHeader } from '@carbon/ibm-products';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../layouts/page-layout';
import { Footer } from '../../components/footer/Footer';
import { useTenant } from '../../context/useTenant';
import { getSupabaseBrowserClient } from '../../lib/supabase.client';
import {
  buildKnowledgeDocumentRows,
  buildMediaObjectRows,
  getIndexingStatusTagType,
  interpretIngestionResult,
  buildStorageScopePrefix,
} from '../../data/knowledgePresentation';

const STORAGE_BUCKETS = [
  {
    id: 'organization-branding',
    label: 'organization-branding (Public SVG/PNG/WebP, 5MB)',
  },
  {
    id: 'workspace-assets',
    label: 'workspace-assets (Private Workspace Assets, 25MB)',
  },
  {
    id: 'project-knowledge',
    label: 'project-knowledge (Private RAG Documents, 50MB)',
  },
  {
    id: 'person-avatars',
    label: 'person-avatars (Public Profile Avatars, 5MB)',
  },
];

const KnowledgeVectorPage = () => {
  const { t, i18n } = useTranslation();
  const {
    activeOrganizationId,
    activeWorkspaceId,
    activeProjectId,
    activeOrganization,
    activeWorkspace,
    activeProject,
    knowledgeDocuments,
    mediaObjects,
    uploadTenantMedia,
    refreshTenantData,
  } = useTenant();

  const [searchQuery, setSearchQuery] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.05);
  const [matchCount, setMatchCount] = useState(5);
  const [searchResults, setSearchResults] = useState([]);
  const [docTitle, setDocTitle] = useState('');
  const [docScope, setDocScope] = useState('project');
  const [docContent, setDocContent] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('project-knowledge');
  const [statusMsg, setStatusMsg] = useState('');
  const notReportedLabel = t('common.notReported', 'Not reported');

  const handleVectorSearch = async (event) => {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    if (!searchQuery.trim()) return;
    setStatusMsg(t('knowledgeVector.searching', 'Searching the knowledge corpus...'));
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke('vector-rag', {
        body: {
          action: 'search',
          query: searchQuery.trim(),
          organizationId: activeOrganizationId,
          workspaceId: activeWorkspaceId,
          projectId: activeProjectId,
          matchThreshold: similarityThreshold,
          matchCount: Number(matchCount) || 5,
        },
      });
      if (error) {
        setStatusMsg(error.message);
        return;
      }
      setSearchResults(data?.results || []);
      setStatusMsg(
        t('knowledgeVector.foundResults', 'Found {{count}} matching knowledge chunks.', {
          count: (data?.results || []).length,
        }),
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const handleIngestDocument = async (event) => {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    if (!docTitle.trim() || !docContent.trim()) return;
    setStatusMsg(t('knowledgeVector.ingestStarting', 'Submitting the document for indexing…'));
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke('vector-rag', {
        body: {
          action: 'ingest',
          name: docTitle.trim(),
          text: docContent.trim(),
          visibilityScope: docScope,
          inLanguage: i18n?.language || 'en',
          organizationId: activeOrganizationId,
          workspaceId: activeWorkspaceId,
          projectId: activeProjectId,
        },
      });
      if (error) {
        setStatusMsg(error.message);
        return;
      }
      const ingestionResult = interpretIngestionResult(data);
      if (ingestionResult.status === 'reported') {
        setDocTitle('');
        setDocContent('');
        setStatusMsg(
          t('knowledgeVector.ingestCompleted', 'Indexed "{{name}}" ({{count}} chunks reported by the service).', {
            name: ingestionResult.documentName,
            count: ingestionResult.chunksIndexed,
          }),
        );
      } else if (ingestionResult.status === 'persisted_without_count') {
        setDocTitle('');
        setDocContent('');
        setStatusMsg(
          t(
            'knowledgeVector.ingestCountUnreported',
            'Document "{{name}}" was returned by the service, but the indexed chunk count was not reported. Check the corpus table for its current status.',
            { name: ingestionResult.documentName },
          ),
        );
      } else {
        setStatusMsg(
          t(
            'knowledgeVector.ingestUnverified',
            'The service did not return a persisted document ID and name. Refresh the corpus before retrying to avoid creating a duplicate.',
          ),
        );
      }

      try {
        await refreshTenantData();
      } catch {
        setStatusMsg(
          t(
            'knowledgeVector.ingestRefreshFailed',
            'The ingestion response was received, but the corpus could not be refreshed. Check the document table before retrying.',
          ),
        );
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Ingestion failed');
    }
  };

  const handleAddFiles = async (_event, { addedFiles }) => {
    if (!Array.isArray(addedFiles) || addedFiles.length === 0) return;
    const file = addedFiles[0];
    setStatusMsg(
      t('knowledgeVector.uploadingMedia', 'Uploading MediaObject "{{name}}" to {{bucket}}…', {
        name: file.name,
        bucket: selectedBucket,
      }),
    );
    try {
      await uploadTenantMedia({ bucketId: selectedBucket, file });
      setStatusMsg(
        t('knowledgeVector.uploadCompleted', 'Uploaded MediaObject "{{name}}" to {{bucket}}.', {
          name: file.name,
          bucket: selectedBucket,
        }),
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const documentRows = useMemo(
    () => buildKnowledgeDocumentRows(knowledgeDocuments || [], { notReported: notReportedLabel }),
    [knowledgeDocuments, notReportedLabel],
  );

  const documentHeaders = useMemo(
    () => [
      { key: 'name', header: 'DigitalDocument Name' },
      { key: 'visibility_scope', header: 'Scope' },
      { key: 'in_language', header: 'inLanguage' },
      { key: 'indexing_status', header: 'Vector Status' },
    ],
    [],
  );

  const mediaRows = useMemo(
    () =>
      buildMediaObjectRows(mediaObjects || [], {
        notReported: notReportedLabel,
        locale: i18n.resolvedLanguage || i18n.language || 'en',
      }),
    [mediaObjects, i18n.language, i18n.resolvedLanguage, notReportedLabel],
  );

  const mediaHeaders = useMemo(
    () => [
      { key: 'name', header: 'MediaObject Name' },
      { key: 'bucket_id', header: 'Bucket' },
      { key: 'encoding_format', header: 'MIME Format' },
      { key: 'content_size', header: 'Size' },
    ],
    [],
  );

  const storageScopePreview = buildStorageScopePrefix(activeOrganizationId, activeWorkspaceId);

  return (
    <PageLayout className="cs--knowledge-vector">
      <PageHeader
        title={t('knowledgeVector.title', 'Knowledge Base & pgvector RAG')}
        subtitle={t(
          'knowledgeVector.subtitle',
          'Multi-tenant Schema.org DigitalDocument storage with deterministic lexical-hash vector retrieval.',
        )}
        className="cs--knowledge-vector__page-header"
      />

      <Tabs className="cs--knowledge-vector__tabs">
        <TabList aria-label={t('knowledgeVector.tabsAriaLabel', 'Knowledge and Vector RAG Sections')}>
          <Tab renderIcon={SearchIcon}>{t('knowledgeVector.tabSearch', 'Search')}</Tab>
          <Tab renderIcon={DocumentAdd}>{t('knowledgeVector.tabIngest', 'Corpus & Ingestion')}</Tab>
          <Tab renderIcon={Folder}>{t('knowledgeVector.tabStorage', 'Storage Buckets')}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <Grid className="cs--knowledge-vector__grid">
              <Column sm={4} md={8} lg={16}>
                <Tile className="cs--knowledge-vector__card">
                  <Stack gap={5}>
                    <div className="cs--knowledge-vector__header">
                      <div>
                        <h3 className="cs--knowledge-vector__title">
                          {t('knowledgeVector.searchHeading', 'Knowledge Search')}
                        </h3>
                        <p className="cs--knowledge-vector__result-text">
                          {t(
                            'knowledgeVector.searchDescription',
                            'Performs cosine distance matching over deterministic 384-dimensional token-hash vectors stored in PostgreSQL pgvector. This is experimental lexical hashing, not model-based semantic embeddings.',
                          )}
                        </p>
                      </div>
                      <div className="cs--knowledge-vector__tags">
                        <Tag type="blue" size="sm">
                          {activeOrganization?.name || notReportedLabel}
                        </Tag>
                        <Tag type="teal" size="sm">
                          {activeWorkspace?.name || notReportedLabel}
                        </Tag>
                        <Tag type="purple" size="sm">
                          {activeProject?.name || notReportedLabel}
                        </Tag>
                      </div>
                    </div>

                    <Form onSubmit={handleVectorSearch}>
                      <Stack gap={4}>
                        <Layer>
                          <Search
                            id="vector-search-query"
                            size="lg"
                            labelText={t('knowledgeVector.searchHeading', 'Knowledge Search')}
                            placeholder={t(
                              'knowledgeVector.searchPlaceholder',
                              'Ask a question or search across tenant knowledge chunks...',
                            )}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </Layer>

                        <Grid narrow>
                          <Column sm={4} md={4} lg={8}>
                            <Layer>
                              <Slider
                                id="vector-similarity-slider"
                                min={0.01}
                                max={0.99}
                                step={0.01}
                                value={similarityThreshold}
                                labelText={t(
                                  'knowledgeVector.similarityThresholdLabel',
                                  'Minimum Similarity Threshold',
                                )}
                                onChange={({ value }) => setSimilarityThreshold(value)}
                              />
                            </Layer>
                          </Column>
                          <Column sm={4} md={4} lg={4}>
                            <Layer>
                              <Select
                                id="vector-match-count"
                                labelText={t('knowledgeVector.matchCountLabel', 'Max Results')}
                                value={String(matchCount)}
                                onChange={(e) => setMatchCount(Number(e.target.value))}
                              >
                                <SelectItem value="3" text="3 results" />
                                <SelectItem value="5" text="5 results" />
                                <SelectItem value="10" text="10 results" />
                              </Select>
                            </Layer>
                          </Column>
                          <Column sm={4} md={8} lg={4} className="cs--knowledge-vector__search-btn-col">
                            <Button type="submit" size="md" kind="primary" renderIcon={SearchIcon}>
                              {t('knowledgeVector.searchButton', 'Search Vectors')}
                            </Button>
                          </Column>
                        </Grid>
                      </Stack>
                    </Form>

                    {statusMsg && (
                      <InlineNotification
                        lowContrast
                        hideCloseButton
                        kind="info"
                        title={t('knowledgeVector.searchHeading', 'Knowledge Search')}
                        subtitle={statusMsg}
                      />
                    )}

                    {searchResults.length > 0 && (
                      <Layer>
                        <Accordion align="start">
                          {searchResults.map((chunk) => (
                            <AccordionItem
                              key={chunk.chunk_id}
                              open
                              title={`${chunk.document_name} — Similarity: ${(Number(chunk.similarity) * 100).toFixed(1)}% (${chunk.visibility_scope})`}
                            >
                              <p className="cs--knowledge-vector__result-text">{chunk.chunk_text}</p>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </Layer>
                    )}
                  </Stack>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>

          <TabPanel>
            <Grid className="cs--knowledge-vector__grid">
              <Column sm={4} md={8} lg={8}>
                <Tile className="cs--knowledge-vector__card">
                  <Stack gap={4}>
                    <h3 className="cs--knowledge-vector__title">
                      {t('knowledgeVector.ingestHeading', 'Ingest Knowledge Document')}
                    </h3>
                    <Form onSubmit={handleIngestDocument}>
                      <Stack gap={4}>
                        <Layer>
                          <TextInput
                            id="ingest-doc-title"
                            labelText={t('knowledgeVector.docTitleLabel', 'Document Title (Schema.org name)')}
                            placeholder="Carbon v11 Multi-Tenant Architecture Guide"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                          />
                        </Layer>

                        <Layer>
                          <Select
                            id="ingest-doc-scope"
                            labelText={t('knowledgeVector.docScopeLabel', 'Visibility Tier Scope')}
                            value={docScope}
                            onChange={(e) => setDocScope(e.target.value)}
                          >
                            <SelectItem value="organization" text="Organization-wide (Shared across all workspaces)" />
                            <SelectItem
                              value="workspace"
                              text="Workspace-scoped (Shared across projects in workspace)"
                            />
                            <SelectItem value="project" text="Project-isolated (Restricted to active project)" />
                          </Select>
                        </Layer>

                        <Layer>
                          <TextArea
                            id="ingest-doc-content"
                            labelText={t('knowledgeVector.docContentLabel', 'Document Content (Markdown / Text)')}
                            rows={6}
                            placeholder="Enter technical documentation, policies, or architectural notes..."
                            value={docContent}
                            onChange={(e) => setDocContent(e.target.value)}
                          />
                        </Layer>

                        <div>
                          <Button type="submit" size="md" kind="primary" renderIcon={DocumentAdd}>
                            {t('knowledgeVector.ingestButton', 'Chunk & Index Document')}
                          </Button>
                        </div>
                      </Stack>
                    </Form>
                  </Stack>
                </Tile>
              </Column>

              <Column sm={4} md={8} lg={8}>
                <Tile className="cs--knowledge-vector__card">
                  <DataTable rows={documentRows} headers={documentHeaders} size="sm">
                    {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                      <TableContainer
                        title={t(
                          'knowledgeVector.docsTableTitle',
                          'Indexed Knowledge Corpus (Schema.org DigitalDocument)',
                        )}
                        description={t(
                          'knowledgeVector.docsTableDesc',
                          'Documents indexed with deterministic 384-d token-hash vectors in public.knowledge_documents.',
                        )}
                      >
                        <Table {...getTableProps()}>
                          <TableHead>
                            <TableRow>
                              {headers.map((header) => (
                                <TableHeader key={header.key} {...getHeaderProps({ header })}>
                                  {header.header}
                                </TableHeader>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                                  <p className="cs--data-table__empty-text">
                                    {t(
                                      'knowledgeVector.emptyDocs',
                                      'No documents indexed in this tenant knowledge corpus yet. Use the form to chunk and index a document.',
                                    )}
                                  </p>
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((row) => (
                                <TableRow key={row.id} {...getRowProps({ row })}>
                                  {row.cells.map((cell) => (
                                    <TableCell key={cell.id}>
                                      {cell.info.header === 'indexing_status' ? (
                                        <Tag type={getIndexingStatusTagType(cell.value)} size="sm">
                                          {cell.value}
                                        </Tag>
                                      ) : (
                                        cell.value
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>

          <TabPanel>
            <Grid className="cs--knowledge-vector__grid">
              <Column sm={4} md={8} lg={6}>
                <Tile className="cs--knowledge-vector__card">
                  <Stack gap={4}>
                    <div className="cs--knowledge-vector__header">
                      <h3 className="cs--knowledge-vector__title">
                        {t('knowledgeVector.uploadHeading', 'Tenant Storage Buckets')}
                      </h3>
                      <Tag type="cool-gray" size="sm" renderIcon={Upload}>
                        Supabase RLS
                      </Tag>
                    </div>

                    <Layer>
                      <Select
                        id="tenant-bucket-select"
                        labelText={t(
                          'knowledgeVector.uploadDescription',
                          'Upload files to isolated tenant storage path',
                        )}
                        value={selectedBucket}
                        onChange={(e) => setSelectedBucket(e.target.value)}
                      >
                        {STORAGE_BUCKETS.map((b) => (
                          <SelectItem key={b.id} value={b.id} text={b.label} />
                        ))}
                      </Select>
                    </Layer>

                    <Layer>
                      <FileUploaderDropContainer
                        accept={['.md', '.txt', '.json', '.pdf', '.svg', '.png', '.webp']}
                        labelText={t(
                          'knowledgeVector.dropzoneLabel',
                          'Drag and drop files here or click to upload to Supabase Storage',
                        )}
                        multiple={false}
                        onAddFiles={handleAddFiles}
                      />
                    </Layer>

                    <div>
                      <p className="cs--knowledge-vector__chips-label">
                        {t('knowledgeVector.storagePathLabel', 'Tenant storage scope prefix (uploaded objects receive a generated name):')}
                      </p>
                      <Layer>
                        {storageScopePreview ? (
                          <CodeSnippet type="single" feedback={t('knowledgeVector.copiedStorageScope', 'Copied storage scope prefix')}>
                            {storageScopePreview}
                          </CodeSnippet>
                        ) : (
                          <p className="cs--knowledge-vector__result-text">
                            {t(
                              'knowledgeVector.storageScopeUnavailable',
                              'Select an organization and workspace to display the storage scope prefix.',
                            )}
                          </p>
                        )}
                      </Layer>
                    </div>
                  </Stack>
                </Tile>
              </Column>

              <Column sm={4} md={8} lg={10}>
                <Tile className="cs--knowledge-vector__card">
                  <DataTable rows={mediaRows} headers={mediaHeaders} size="sm">
                    {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                      <TableContainer
                        title={t(
                          'knowledgeVector.mediaTableTitle',
                          'Tenant Storage MediaObjects (Schema.org MediaObject)',
                        )}
                        description={t(
                          'knowledgeVector.mediaTableDesc',
                          'Live objects stored across tenant-isolated buckets in public.media_objects.',
                        )}
                      >
                        <Table {...getTableProps()}>
                          <TableHead>
                            <TableRow>
                              {headers.map((header) => (
                                <TableHeader key={header.key} {...getHeaderProps({ header })}>
                                  {header.header}
                                </TableHeader>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={headers.length} className="cs--data-table__empty-cell">
                                  <p className="cs--data-table__empty-text">
                                    {t('knowledgeVector.emptyMedia', 'No media objects uploaded to this bucket yet.')}
                                  </p>
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((row) => (
                                <TableRow key={row.id} {...getRowProps({ row })}>
                                  {row.cells.map((cell) => (
                                    <TableCell key={cell.id}>{cell.value}</TableCell>
                                  ))}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                </Tile>
              </Column>
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Footer />
    </PageLayout>
  );
};

export default KnowledgeVectorPage;

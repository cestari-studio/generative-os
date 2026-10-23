/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Button, Form, InlineNotification, Layer, Select, SelectItem, Stack, Tag, TextInput } from '@carbon/react';
import { Enterprise, FolderDetails, Workspace } from '@carbon/icons-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../context/useTenant';

export const WorkspaceSwitcherPanel = ({ className }) => {
  const { t } = useTranslation();
  const {
    organizations,
    workspaces,
    projects,
    activeOrganizationId,
    activeWorkspaceId,
    activeProjectId,
    activeOrganization,
    activeWorkspace,
    activeProject,
    switchActiveContext,
    createOrganizationHierarchy,
    statusMessage,
  } = useTenant();

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgIdentifier, setNewOrgIdentifier] = useState('');

  const filteredWorkspaces = workspaces.filter((ws) => ws.organization_id === activeOrganizationId);
  const filteredProjects = projects.filter((prj) => prj.workspace_id === activeWorkspaceId);

  const handleOrgChange = (event) => {
    const nextOrgId = event.target.value;
    const nextWs = workspaces.find((w) => w.organization_id === nextOrgId);
    const nextPrj = projects.find((p) => p.workspace_id === nextWs?.id);
    switchActiveContext({
      organizationId: nextOrgId,
      workspaceId: nextWs?.id || null,
      projectId: nextPrj?.id || null,
    });
  };

  const handleWorkspaceChange = (event) => {
    const nextWsId = event.target.value;
    const nextPrj = projects.find((p) => p.workspace_id === nextWsId);
    switchActiveContext({
      organizationId: activeOrganizationId,
      workspaceId: nextWsId,
      projectId: nextPrj?.id || null,
    });
  };

  const handleProjectChange = (event) => {
    switchActiveContext({
      organizationId: activeOrganizationId,
      workspaceId: activeWorkspaceId,
      projectId: event.target.value,
    });
  };

  const handleCreateOrg = async (event) => {
    event.preventDefault();
    if (!newOrgName.trim() || !newOrgIdentifier.trim()) return;
    try {
      await createOrganizationHierarchy({
        name: newOrgName.trim(),
        identifier: newOrgIdentifier.trim().toLowerCase(),
      });
      setNewOrgName('');
      setNewOrgIdentifier('');
    } catch {
      // Status message is updated by context
    }
  };

  return (
    <Layer className={classNames(className, 'cs--workspace-switcher')}>
      <Stack gap={5}>
        <Stack gap={3}>
          <h2 className="cs--workspace-switcher__title">
            {t('workspaceSwitcher.heading', 'Multi-Tenant Context (Schema.org)')}
          </h2>
          <div className="cs--workspace-switcher__tags">
            <Tag type="blue" size="sm" renderIcon={Enterprise}>
              {activeOrganization?.name || 'Organization'}
            </Tag>
            <Tag type="teal" size="sm" renderIcon={Workspace}>
              {activeWorkspace?.name || 'Workspace'}
            </Tag>
            <Tag type="purple" size="sm" renderIcon={FolderDetails}>
              {activeProject?.name || 'Project'}
            </Tag>
          </div>
        </Stack>

        <Stack gap={4}>
          <Select
            id="tenant-org-select"
            labelText={t('workspaceSwitcher.organizationLabel', 'Organization (Tier 1)')}
            value={activeOrganizationId}
            onChange={handleOrgChange}
          >
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id} text={org.name} />
            ))}
          </Select>

          <Select
            id="tenant-workspace-select"
            labelText={t('workspaceSwitcher.workspaceLabel', 'Workspace / Department (Tier 2)')}
            value={activeWorkspaceId}
            onChange={handleWorkspaceChange}
          >
            {filteredWorkspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id} text={ws.name} />
            ))}
          </Select>

          <Select
            id="tenant-project-select"
            labelText={t('workspaceSwitcher.projectLabel', 'Project / CreativeWork (Tier 3)')}
            value={activeProjectId}
            onChange={handleProjectChange}
          >
            {filteredProjects.map((prj) => (
              <SelectItem key={prj.id} value={prj.id} text={prj.name} />
            ))}
          </Select>
        </Stack>

        <Form className="cs--workspace-switcher__form" onSubmit={handleCreateOrg}>
          <Stack gap={3}>
            <TextInput
              id="new-org-name"
              labelText={t('workspaceSwitcher.orgNamePlaceholder', 'Organization name')}
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              size="sm"
            />
            <TextInput
              id="new-org-identifier"
              labelText={t('workspaceSwitcher.orgIdentifierPlaceholder', 'organization-slug')}
              value={newOrgIdentifier}
              onChange={(e) => setNewOrgIdentifier(e.target.value)}
              size="sm"
            />
            <Button type="submit" size="sm" kind="secondary" renderIcon={Enterprise}>
              {t('workspaceSwitcher.createOrganization', 'Create Organization Hierarchy')}
            </Button>
          </Stack>
        </Form>

        {statusMessage && (
          <InlineNotification
            lowContrast
            hideCloseButton
            kind="info"
            title={t('workspaceSwitcher.statusTitle', 'Tenant Context')}
            subtitle={statusMessage}
          />
        )}
      </Stack>
    </Layer>
  );
};

WorkspaceSwitcherPanel.propTypes = {
  className: PropTypes.string,
};

export default WorkspaceSwitcherPanel;

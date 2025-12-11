import type { WorkflowDefinition, WorkflowInstance } from '@prisma/client';

export interface WorkflowActionConfig {
  key: string;
  label: string;
  to: string;
  roles?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowStateConfig {
  key: string;
  label: string;
  description?: string;
  final?: boolean;
  metadata?: Record<string, unknown>;
  business?: Record<string, unknown>;
  actions: WorkflowActionConfig[];
}

export interface WorkflowDefinitionConfig {
  states: WorkflowStateConfig[];
}

export type WorkflowDefinitionWithConfig = WorkflowDefinition & {
  config: WorkflowDefinitionConfig | Record<string, unknown> | null;
};

export interface WorkflowInstanceWithDefinition extends WorkflowInstance {
  definition: WorkflowDefinitionWithConfig;
}

export interface WorkflowTransitionResult {
  instance: WorkflowInstanceWithDefinition;
  previousState: WorkflowStateConfig;
  nextState: WorkflowStateConfig;
  action: WorkflowActionConfig;
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowInstanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkflowActionConfig,
  WorkflowDefinitionConfig,
  WorkflowDefinitionWithConfig,
  WorkflowInstanceWithDefinition,
  WorkflowStateConfig,
  WorkflowTransitionResult,
} from './workflow.types';
import {
  UpsertWorkflowDefinitionDto,
  WorkflowStateInputDto,
} from './dto/upsert-workflow-definition.dto';

interface CreateWorkflowInstanceInput {
  definitionCode: string;
  targetType: string;
  targetId: string;
  context?: Record<string, unknown>;
  createdById?: string;
}

interface PerformWorkflowActionInput {
  instanceId: string;
  actionKey: string;
  actorId?: string;
  actorRoles?: string[];
  comment?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDefinitionByCode(code: string) {
    return this.prisma.workflowDefinition.findUnique({
      where: { code },
    }) as unknown as Promise<WorkflowDefinitionWithConfig | null>;
  }

  async ensureDefinition(dto: UpsertWorkflowDefinitionDto) {
    return this.upsertDefinition(dto);
  }

  async upsertDefinition(dto: UpsertWorkflowDefinitionDto) {
    const normalized = this.normalizeConfig(dto.states);
    if (normalized.states.length === 0) {
      throw new BadRequestException('工作流至少需要一个状态');
    }
    const initialState = normalized.states[0].key;
    const roleSet = new Set<string>();
    normalized.states.forEach((state) => {
      state.actions?.forEach((action) => {
        action.roles?.forEach((role) => {
          const trimmed = role.trim();
          if (trimmed.length > 0) {
            roleSet.add(trimmed);
          }
        });
      });
    });

    const payload = {
      name: dto.name,
      description: dto.description,
      category: dto.category,
      initialState,
      states: normalized.states.map((state) => state.key),
      roles: Array.from(roleSet),
      config: normalized as unknown as Prisma.InputJsonValue,
    };

    return this.prisma.workflowDefinition.upsert({
      where: { code: dto.code },
      update: payload,
      create: { ...payload, code: dto.code },
    });
  }

  async createInstance(
    input: CreateWorkflowInstanceInput,
  ): Promise<WorkflowInstanceWithDefinition> {
    const definition = await this.getDefinitionByCode(input.definitionCode);
    if (!definition || !definition.isActive) {
      throw new BadRequestException('指定的工作流定义不存在或不可用');
    }
    const config = this.parseDefinitionConfig(definition);
    const initialState = config.states[0]?.key ?? definition.initialState;
    if (!initialState) {
      throw new BadRequestException('工作流定义缺少初始状态');
    }

    const instance = await this.prisma.workflowInstance.create({
      data: {
        definitionId: definition.id,
        definitionCode: definition.code,
        currentState: initialState,
        status: WorkflowInstanceStatus.ACTIVE,
        targetType: input.targetType,
        targetId: input.targetId,
        context: (input.context ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdById: input.createdById,
      },
      include: { definition: true },
    });
    return instance as WorkflowInstanceWithDefinition;
  }

  async performAction(
    input: PerformWorkflowActionInput,
  ): Promise<WorkflowTransitionResult> {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id: input.instanceId },
      include: { definition: true },
    });
    if (!instance) {
      throw new NotFoundException('找不到对应的流程实例');
    }
    const definition = instance.definition as WorkflowDefinitionWithConfig;
    const config = this.parseDefinitionConfig(definition);
    const previousState = this.getStateConfig(config, instance.currentState);
    const action = previousState.actions.find(
      (entry) => entry.key === input.actionKey,
    );
    if (!action) {
      throw new BadRequestException('当前状态不支持该操作');
    }

    const allowedRoles = action.roles ?? [];
    const actorRoles = new Set(
      (input.actorRoles ?? []).map((role) => role.trim()),
    );
    if (
      allowedRoles.length > 0 &&
      !allowedRoles.some((role) => role === '*' || actorRoles.has(role))
    ) {
      throw new ForbiddenException('没有执行该流程动作的权限');
    }

    const nextState = this.getStateConfig(config, action.to);
    const isFinal = Boolean(nextState.final);
    const now = new Date();

    const [updatedInstance] = await this.prisma.$transaction([
      this.prisma.workflowInstance.update({
        where: { id: input.instanceId },
        data: {
          currentState: nextState.key,
          status: isFinal
            ? WorkflowInstanceStatus.COMPLETED
            : WorkflowInstanceStatus.ACTIVE,
          completedAt: isFinal ? now : undefined,
          cancelledAt: undefined,
        },
        include: { definition: true },
      }),
      this.prisma.workflowAction.create({
        data: {
          instanceId: input.instanceId,
          state: previousState.key,
          actionKey: action.key,
          actionName: action.label,
          actorId: input.actorId,
          actorRole: allowedRoles.find((role) => actorRoles.has(role)) ?? null,
          comment: input.comment,
          payload: input.payload
            ? (input.payload as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      }),
    ]);

    return {
      instance: updatedInstance as WorkflowInstanceWithDefinition,
      previousState,
      nextState,
      action,
    };
  }

  parseDefinitionConfig(definition: WorkflowDefinitionWithConfig) {
    const raw = definition.config as WorkflowDefinitionConfig | null;
    if (raw && Array.isArray(raw.states)) {
      return raw;
    }
    const fallbackStates: WorkflowStateConfig[] = definition.states.map(
      (stateKey, index) => ({
        key: stateKey,
        label: stateKey,
        final: index === definition.states.length - 1,
        actions: [],
      }),
    );
    return { states: fallbackStates };
  }

  private getStateConfig(config: WorkflowDefinitionConfig, stateKey: string) {
    const found = config.states.find((entry) => entry.key === stateKey);
    if (!found) {
      throw new NotFoundException(`未在流程配置中找到状态 ${stateKey}`);
    }
    return found;
  }

  private normalizeConfig(states: WorkflowStateInputDto[]) {
    if (!Array.isArray(states) || states.length === 0) {
      throw new BadRequestException('至少需要 1 个状态配置');
    }
    const stateMap = new Map<string, WorkflowStateConfig>();

    states.forEach((state) => {
      const key = state.key.trim();
      if (stateMap.has(key)) {
        throw new BadRequestException(`存在重复的状态 key: ${key}`);
      }
      const normalizedActions: WorkflowActionConfig[] = (
        state.actions ?? []
      ).map((action) => ({
        key: action.key.trim(),
        label: action.label,
        to: action.to.trim(),
        roles: action.roles?.map((role) => role.trim()).filter(Boolean),
        description: action.description,
        metadata: action.metadata,
      }));
      stateMap.set(key, {
        key,
        label: state.label,
        description: state.description,
        final: state.final,
        metadata: state.metadata,
        business: state.business,
        actions: normalizedActions,
      });
    });

    for (const [key, state] of stateMap.entries()) {
      state.actions.forEach((action) => {
        if (!stateMap.has(action.to)) {
          throw new BadRequestException(
            `状态 ${key} 的动作 ${action.key} 指向未定义的状态 ${action.to}`,
          );
        }
      });
    }

    return { states: Array.from(stateMap.values()) };
  }
}

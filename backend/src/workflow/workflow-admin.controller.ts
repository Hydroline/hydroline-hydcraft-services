import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { WorkflowService } from './workflow.service';
import { UpsertWorkflowDefinitionDto } from './dto/upsert-workflow-definition.dto';

@ApiTags('流程配置')
@Controller('workflow/definitions')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class WorkflowAdminController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.WORKFLOW_VIEW_DEFINITIONS)
  @ApiOperation({ summary: '获取所有流程定义' })
  async listDefinitions() {
    return this.workflowService.listDefinitions();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE_DEFINITIONS)
  @ApiOperation({ summary: '新增或更新流程定义' })
  async upsertDefinition(@Body() body: UpsertWorkflowDefinitionDto) {
    return this.workflowService.upsertDefinition(body);
  }
}

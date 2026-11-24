-- CreateTable
CREATE TABLE `LeaveType` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `requiresReason` BOOLEAN NOT NULL DEFAULT false,
    `requiresEvidence` BOOLEAN NOT NULL DEFAULT false,
    `requiresHrReview` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeaveType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeavePolicy` (
    `id` VARCHAR(36) NOT NULL,
    `leaveTypeId` VARCHAR(36) NOT NULL,
    `period` VARCHAR(10) NOT NULL,
    `entitlementDays` DOUBLE NOT NULL DEFAULT 0,
    `carryoverCapDays` DOUBLE NOT NULL DEFAULT 0,
    `maxConsecutiveDays` INTEGER NOT NULL DEFAULT 365,
    `minNoticeDays` INTEGER NOT NULL DEFAULT 0,
    `allowNegativeBalance` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeavePolicy_period_idx`(`period`),
    UNIQUE INDEX `LeavePolicy_leaveTypeId_period_key`(`leaveTypeId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalance` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `leaveTypeId` VARCHAR(36) NOT NULL,
    `period` VARCHAR(10) NOT NULL,
    `entitlementDays` DOUBLE NOT NULL DEFAULT 0,
    `carryoverDays` DOUBLE NOT NULL DEFAULT 0,
    `usedDays` DOUBLE NOT NULL DEFAULT 0,
    `adjustmentDays` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveBalance_period_idx`(`period`),
    UNIQUE INDEX `LeaveBalance_employeeId_leaveTypeId_period_key`(`employeeId`, `leaveTypeId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalanceAdjustment` (
    `id` VARCHAR(36) NOT NULL,
    `balanceId` VARCHAR(36) NOT NULL,
    `delta` DOUBLE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdById` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeaveBalanceAdjustment_balanceId_createdAt_idx`(`balanceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowInstance` (
    `id` VARCHAR(36) NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `currentStep` INTEGER NOT NULL DEFAULT 1,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkflowInstance_status_idx`(`status`),
    UNIQUE INDEX `WorkflowInstance_entityType_entityId_key`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStep` (
    `id` VARCHAR(36) NOT NULL,
    `instanceId` VARCHAR(36) NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `approverRoleKey` VARCHAR(60) NULL,
    `approverUserId` VARCHAR(36) NULL,
    `scopeType` ENUM('OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'FACULTY', 'INSTITUTION') NULL,
    `scopeUnitId` VARCHAR(36) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `decision` VARCHAR(40) NULL,
    `comment` TEXT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `actedAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkflowStep_status_idx`(`status`),
    UNIQUE INDEX `WorkflowStep_instanceId_stepOrder_key`(`instanceId`, `stepOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `leaveTypeId` VARCHAR(36) NOT NULL,
    `period` VARCHAR(10) NOT NULL,
    `requestedById` VARCHAR(36) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `daysRequested` DOUBLE NOT NULL,
    `reason` TEXT NULL,
    `isHalfDay` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'SUBMITTED', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedById` VARCHAR(36) NULL,
    `decisionComment` TEXT NULL,
    `workflowInstanceId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveRequest_employeeId_startDate_idx`(`employeeId`, `startDate`),
    INDEX `LeaveRequest_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `LeaveRequest_leaveTypeId_period_idx`(`leaveTypeId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequestDocument` (
    `leaveRequestId` VARCHAR(36) NOT NULL,
    `documentId` VARCHAR(36) NOT NULL,

    PRIMARY KEY (`leaveRequestId`, `documentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HrRequest` (
    `id` VARCHAR(36) NOT NULL,
    `reference` VARCHAR(20) NOT NULL,
    `requesterEmployeeId` VARCHAR(36) NOT NULL,
    `requestedForEmployeeId` VARCHAR(36) NULL,
    `category` ENUM('GENERAL', 'IT', 'FACILITIES', 'PAYROLL', 'LEAVE_SUPPORT', 'COMPLAINT', 'OTHER') NOT NULL,
    `subject` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `sensitivity` ENUM('INTERNAL', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
    `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `assignedToUserId` VARCHAR(36) NULL,
    `dueAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `feedbackRating` INTEGER NULL,
    `feedbackComment` TEXT NULL,
    `relatedLeaveRequestId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HrRequest_reference_key`(`reference`),
    INDEX `HrRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `HrRequest_assignedToUserId_status_idx`(`assignedToUserId`, `status`),
    INDEX `HrRequest_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HrRequestEvent` (
    `id` VARCHAR(36) NOT NULL,
    `requestId` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `action` VARCHAR(80) NOT NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HrRequestEvent_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contract` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `type` ENUM('PERMANENT', 'FIXED_TERM', 'PROBATION', 'VISITING', 'ADJUNCT', 'PROJECT') NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
    `renewalStatus` ENUM('NONE', 'DUE', 'RENEWED', 'EXPIRED') NOT NULL DEFAULT 'NONE',
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `documentId` VARCHAR(36) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Contract_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `Contract_endDate_idx`(`endDate`),
    INDEX `Contract_renewalStatus_idx`(`renewalStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProbationRecord` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `reviewDate` DATE NOT NULL,
    `outcome` ENUM('PENDING', 'CONFIRMED', 'EXTENDED', 'TERMINATED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `reviewedById` VARCHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProbationRecord_employeeId_outcome_idx`(`employeeId`, `outcome`),
    INDEX `ProbationRecord_reviewDate_idx`(`reviewDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reminder` (
    `id` VARCHAR(36) NOT NULL,
    `type` ENUM('CONTRACT_EXPIRY', 'PROBATION_REVIEW') NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(36) NOT NULL,
    `recipientUserId` VARCHAR(36) NOT NULL,
    `dueDate` DATE NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
    `message` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    INDEX `Reminder_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `Reminder_type_entityId_dueDate_recipientUserId_key`(`type`, `entityId`, `dueDate`, `recipientUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingTemplate` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OnboardingTemplate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingTemplateTask` (
    `id` VARCHAR(36) NOT NULL,
    `templateId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `ownerRoleKey` VARCHAR(60) NOT NULL,
    `dueOffsetDays` INTEGER NOT NULL DEFAULT 0,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `OnboardingTemplateTask_templateId_sortOrder_idx`(`templateId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingChecklist` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `templateId` VARCHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `dueDate` DATE NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OnboardingChecklist_employeeId_status_idx`(`employeeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingTask` (
    `id` VARCHAR(36) NOT NULL,
    `checklistId` VARCHAR(36) NOT NULL,
    `templateTaskId` VARCHAR(36) NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `ownerUserId` VARCHAR(36) NULL,
    `dueDate` DATE NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(36) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OnboardingTask_checklistId_sortOrder_idx`(`checklistId`, `sortOrder`),
    INDEX `OnboardingTask_status_dueDate_idx`(`status`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Delegation` (
    `id` VARCHAR(36) NOT NULL,
    `grantorUserId` VARCHAR(36) NOT NULL,
    `delegateUserId` VARCHAR(36) NOT NULL,
    `permissionKey` VARCHAR(80) NOT NULL,
    `scopeType` ENUM('OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'FACULTY', 'INSTITUTION') NOT NULL,
    `scopeUnitId` VARCHAR(36) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Delegation_delegateUserId_status_idx`(`delegateUserId`, `status`),
    INDEX `Delegation_permissionKey_idx`(`permissionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeavePolicy` ADD CONSTRAINT `LeavePolicy_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalanceAdjustment` ADD CONSTRAINT `LeaveBalanceAdjustment_balanceId_fkey` FOREIGN KEY (`balanceId`) REFERENCES `LeaveBalance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalanceAdjustment` ADD CONSTRAINT `LeaveBalanceAdjustment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `WorkflowInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_workflowInstanceId_fkey` FOREIGN KEY (`workflowInstanceId`) REFERENCES `WorkflowInstance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequestDocument` ADD CONSTRAINT `LeaveRequestDocument_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequestDocument` ADD CONSTRAINT `LeaveRequestDocument_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequest` ADD CONSTRAINT `HrRequest_requesterEmployeeId_fkey` FOREIGN KEY (`requesterEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequest` ADD CONSTRAINT `HrRequest_requestedForEmployeeId_fkey` FOREIGN KEY (`requestedForEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequest` ADD CONSTRAINT `HrRequest_assignedToUserId_fkey` FOREIGN KEY (`assignedToUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequest` ADD CONSTRAINT `HrRequest_relatedLeaveRequestId_fkey` FOREIGN KEY (`relatedLeaveRequestId`) REFERENCES `LeaveRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequestEvent` ADD CONSTRAINT `HrRequestEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `HrRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HrRequestEvent` ADD CONSTRAINT `HrRequestEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contract` ADD CONSTRAINT `Contract_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationRecord` ADD CONSTRAINT `ProbationRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationRecord` ADD CONSTRAINT `ProbationRecord_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingTemplateTask` ADD CONSTRAINT `OnboardingTemplateTask_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `OnboardingTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingChecklist` ADD CONSTRAINT `OnboardingChecklist_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingChecklist` ADD CONSTRAINT `OnboardingChecklist_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `OnboardingTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingTask` ADD CONSTRAINT `OnboardingTask_checklistId_fkey` FOREIGN KEY (`checklistId`) REFERENCES `OnboardingChecklist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingTask` ADD CONSTRAINT `OnboardingTask_templateTaskId_fkey` FOREIGN KEY (`templateTaskId`) REFERENCES `OnboardingTemplateTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingTask` ADD CONSTRAINT `OnboardingTask_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingTask` ADD CONSTRAINT `OnboardingTask_completedById_fkey` FOREIGN KEY (`completedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delegation` ADD CONSTRAINT `Delegation_grantorUserId_fkey` FOREIGN KEY (`grantorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delegation` ADD CONSTRAINT `Delegation_delegateUserId_fkey` FOREIGN KEY (`delegateUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delegation` ADD CONSTRAINT `Delegation_revokedById_fkey` FOREIGN KEY (`revokedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delegation` ADD CONSTRAINT `Delegation_scopeUnitId_fkey` FOREIGN KEY (`scopeUnitId`) REFERENCES `OrgUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

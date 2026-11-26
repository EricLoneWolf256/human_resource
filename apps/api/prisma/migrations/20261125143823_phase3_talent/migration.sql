-- CreateTable
CREATE TABLE `Vacancy` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `requirements` TEXT NULL,
    `unitId` VARCHAR(36) NOT NULL,
    `positionId` VARCHAR(36) NULL,
    `employmentType` ENUM('PERMANENT', 'FIXED_TERM', 'PART_TIME', 'VISITING', 'ADJUNCT', 'PROJECT', 'TEMPORARY') NOT NULL,
    `openings` INTEGER NOT NULL DEFAULT 1,
    `closingDate` DATE NOT NULL,
    `salaryGrade` VARCHAR(20) NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'FILLED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(36) NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vacancy_code_key`(`code`),
    INDEX `Vacancy_status_closingDate_idx`(`status`, `closingDate`),
    INDEX `Vacancy_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Applicant` (
    `id` VARCHAR(36) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `coverNote` TEXT NULL,
    `qualifications` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Applicant_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Application` (
    `id` VARCHAR(36) NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `vacancyId` VARCHAR(36) NOT NULL,
    `applicantId` VARCHAR(36) NOT NULL,
    `status` ENUM('SUBMITTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED') NOT NULL DEFAULT 'SUBMITTED',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `screeningNote` TEXT NULL,
    `decisionNote` TEXT NULL,
    `decisionById` VARCHAR(36) NULL,
    `decisionAt` DATETIME(3) NULL,
    `offerDetails` TEXT NULL,
    `offeredAt` DATETIME(3) NULL,
    `offerRespondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Application_reference_key`(`reference`),
    INDEX `Application_vacancyId_status_idx`(`vacancyId`, `status`),
    INDEX `Application_submittedAt_idx`(`submittedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApplicationEvent` (
    `id` VARCHAR(36) NOT NULL,
    `applicationId` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `action` VARCHAR(80) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApplicationEvent_applicationId_createdAt_idx`(`applicationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PanelAssignment` (
    `id` VARCHAR(36) NOT NULL,
    `vacancyId` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `role` ENUM('CHAIR', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PanelAssignment_userId_idx`(`userId`),
    UNIQUE INDEX `PanelAssignment_vacancyId_userId_key`(`vacancyId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interview` (
    `id` VARCHAR(36) NOT NULL,
    `applicationId` VARCHAR(36) NOT NULL,
    `panelAssignmentId` VARCHAR(36) NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `location` VARCHAR(120) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Interview_applicationId_scheduledAt_idx`(`applicationId`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scorecard` (
    `id` VARCHAR(36) NOT NULL,
    `applicationId` VARCHAR(36) NOT NULL,
    `panelAssignmentId` VARCHAR(36) NOT NULL,
    `criteria` JSON NOT NULL,
    `recommendation` ENUM('STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO') NOT NULL,
    `strengths` TEXT NULL,
    `concerns` TEXT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Scorecard_applicationId_idx`(`applicationId`),
    UNIQUE INDEX `Scorecard_applicationId_panelAssignmentId_key`(`applicationId`, `panelAssignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppraisalCycle` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `templateType` ENUM('ACADEMIC', 'NON_ACADEMIC') NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AppraisalCycle_code_key`(`code`),
    INDEX `AppraisalCycle_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Appraisal` (
    `id` VARCHAR(36) NOT NULL,
    `cycleId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `supervisorUserId` VARCHAR(36) NULL,
    `hodUserId` VARCHAR(36) NULL,
    `hrUserId` VARCHAR(36) NULL,
    `templateType` ENUM('ACADEMIC', 'NON_ACADEMIC') NOT NULL,
    `status` ENUM('DRAFT', 'SELF_REVIEW', 'SUPERVISOR_REVIEW', 'HOD_REVIEW', 'HR_VALIDATION', 'FINALIZED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `selfRating` INTEGER NULL,
    `selfComment` TEXT NULL,
    `supervisorRating` INTEGER NULL,
    `supervisorComment` TEXT NULL,
    `hodRating` INTEGER NULL,
    `hodComment` TEXT NULL,
    `hrComment` TEXT NULL,
    `finalRating` INTEGER NULL,
    `finalComment` TEXT NULL,
    `developmentPlan` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `finalizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Appraisal_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `Appraisal_status_idx`(`status`),
    UNIQUE INDEX `Appraisal_cycleId_employeeId_key`(`cycleId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppraisalObjective` (
    `id` VARCHAR(36) NOT NULL,
    `appraisalId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `target` VARCHAR(500) NOT NULL,
    `weight` INTEGER NOT NULL,
    `selfRating` INTEGER NULL,
    `supervisorRating` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AppraisalObjective_appraisalId_idx`(`appraisalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingCourse` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `category` ENUM('TECHNICAL', 'PEDAGOGICAL', 'MANAGEMENT', 'COMPLIANCE', 'LANGUAGE', 'OTHER') NOT NULL,
    `provider` VARCHAR(150) NULL,
    `durationHours` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrainingCourse_code_key`(`code`),
    INDEX `TrainingCourse_category_isActive_idx`(`category`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingRequest` (
    `id` VARCHAR(36) NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `courseId` VARCHAR(36) NOT NULL,
    `reason` TEXT NOT NULL,
    `neededBy` DATE NULL,
    `status` ENUM('REQUESTED', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'REGISTERED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `supervisorComment` TEXT NULL,
    `hrComment` TEXT NULL,
    `decidedById` VARCHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `completedAt` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrainingRequest_reference_key`(`reference`),
    INDEX `TrainingRequest_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `TrainingRequest_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrainingRecord` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `courseId` VARCHAR(36) NOT NULL,
    `requestId` VARCHAR(36) NULL,
    `completedAt` DATE NOT NULL,
    `score` INTEGER NULL,
    `certificateNumber` VARCHAR(80) NULL,
    `expiryDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrainingRecord_employeeId_expiryDate_idx`(`employeeId`, `expiryDate`),
    UNIQUE INDEX `TrainingRecord_employeeId_courseId_completedAt_key`(`employeeId`, `courseId`, `completedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeSkill` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `certificateNumber` VARCHAR(80) NULL,
    `issuedAt` DATE NOT NULL,
    `expiryDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeSkill_employeeId_expiryDate_idx`(`employeeId`, `expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CareerCase` (
    `id` VARCHAR(36) NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `type` ENUM('PROMOTION', 'TRANSFER', 'ACTING_APPOINTMENT') NOT NULL,
    `status` ENUM('NOMINATED', 'ELIGIBILITY_CHECK', 'DOCUMENT_VERIFICATION', 'COMMITTEE_REVIEW', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'EFFECTIVE', 'CANCELLED') NOT NULL DEFAULT 'NOMINATED',
    `currentUnitId` VARCHAR(36) NOT NULL,
    `currentPositionId` VARCHAR(36) NULL,
    `proposedUnitId` VARCHAR(36) NULL,
    `proposedPositionId` VARCHAR(36) NULL,
    `effectiveDate` DATE NOT NULL,
    `reason` TEXT NOT NULL,
    `eligibilityNote` TEXT NULL,
    `documentsVerified` BOOLEAN NOT NULL DEFAULT false,
    `committeeNote` TEXT NULL,
    `decisionNote` TEXT NULL,
    `decidedById` VARCHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CareerCase_reference_key`(`reference`),
    INDEX `CareerCase_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `CareerCase_status_effectiveDate_idx`(`status`, `effectiveDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CareerCaseEvent` (
    `id` VARCHAR(36) NOT NULL,
    `caseId` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `action` VARCHAR(80) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CareerCaseEvent_caseId_createdAt_idx`(`caseId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Vacancy` ADD CONSTRAINT `Vacancy_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `OrgUnit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vacancy` ADD CONSTRAINT `Vacancy_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vacancy` ADD CONSTRAINT `Vacancy_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vacancy` ADD CONSTRAINT `Vacancy_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Application` ADD CONSTRAINT `Application_vacancyId_fkey` FOREIGN KEY (`vacancyId`) REFERENCES `Vacancy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Application` ADD CONSTRAINT `Application_applicantId_fkey` FOREIGN KEY (`applicantId`) REFERENCES `Applicant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Application` ADD CONSTRAINT `Application_decisionById_fkey` FOREIGN KEY (`decisionById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicationEvent` ADD CONSTRAINT `ApplicationEvent_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `Application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicationEvent` ADD CONSTRAINT `ApplicationEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PanelAssignment` ADD CONSTRAINT `PanelAssignment_vacancyId_fkey` FOREIGN KEY (`vacancyId`) REFERENCES `Vacancy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PanelAssignment` ADD CONSTRAINT `PanelAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PanelAssignment` ADD CONSTRAINT `PanelAssignment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `Application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_panelAssignmentId_fkey` FOREIGN KEY (`panelAssignmentId`) REFERENCES `PanelAssignment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scorecard` ADD CONSTRAINT `Scorecard_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `Application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scorecard` ADD CONSTRAINT `Scorecard_panelAssignmentId_fkey` FOREIGN KEY (`panelAssignmentId`) REFERENCES `PanelAssignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppraisalCycle` ADD CONSTRAINT `AppraisalCycle_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appraisal` ADD CONSTRAINT `Appraisal_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AppraisalCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appraisal` ADD CONSTRAINT `Appraisal_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appraisal` ADD CONSTRAINT `Appraisal_supervisorUserId_fkey` FOREIGN KEY (`supervisorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appraisal` ADD CONSTRAINT `Appraisal_hodUserId_fkey` FOREIGN KEY (`hodUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appraisal` ADD CONSTRAINT `Appraisal_hrUserId_fkey` FOREIGN KEY (`hrUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AppraisalObjective` ADD CONSTRAINT `AppraisalObjective_appraisalId_fkey` FOREIGN KEY (`appraisalId`) REFERENCES `Appraisal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRequest` ADD CONSTRAINT `TrainingRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRequest` ADD CONSTRAINT `TrainingRequest_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `TrainingCourse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRequest` ADD CONSTRAINT `TrainingRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRecord` ADD CONSTRAINT `TrainingRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRecord` ADD CONSTRAINT `TrainingRecord_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `TrainingCourse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrainingRecord` ADD CONSTRAINT `TrainingRecord_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `TrainingRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeSkill` ADD CONSTRAINT `EmployeeSkill_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareerCase` ADD CONSTRAINT `CareerCase_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareerCase` ADD CONSTRAINT `CareerCase_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareerCaseEvent` ADD CONSTRAINT `CareerCaseEvent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `CareerCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CareerCaseEvent` ADD CONSTRAINT `CareerCaseEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

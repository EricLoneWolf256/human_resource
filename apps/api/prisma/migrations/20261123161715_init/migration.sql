-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `lastLoginAt` DATETIME(3) NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_employeeId_key`(`employeeId`),
    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `refreshTokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `userAgent` VARCHAR(300) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_refreshTokenHash_key`(`refreshTokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LoginAttempt` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `success` BOOLEAN NOT NULL,
    `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoginAttempt_email_attemptedAt_idx`(`email`, `attemptedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `module` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Role_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(36) NOT NULL,
    `permissionKey` VARCHAR(80) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoleAssignment` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `roleId` VARCHAR(36) NOT NULL,
    `scopeType` ENUM('OWN', 'ASSIGNED', 'TEAM', 'DEPARTMENT', 'FACULTY', 'INSTITUTION') NOT NULL,
    `scopeUnitId` VARCHAR(36) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `assignedById` VARCHAR(36) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(36) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RoleAssignment_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `RoleAssignment_roleId_idx`(`roleId`),
    INDEX `RoleAssignment_scopeUnitId_idx`(`scopeUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrgUnit` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('UNIVERSITY', 'FACULTY', 'SCHOOL', 'DIRECTORATE', 'DEPARTMENT', 'OFFICE', 'UNIT', 'SECTION') NOT NULL,
    `parentId` VARCHAR(36) NULL,
    `headEmployeeId` VARCHAR(36) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrgUnit_code_key`(`code`),
    INDEX `OrgUnit_parentId_idx`(`parentId`),
    INDEX `OrgUnit_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Position` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `grade` VARCHAR(20) NULL,
    `unitId` VARCHAR(36) NOT NULL,
    `approvedHeadcount` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Position_code_key`(`code`),
    INDEX `Position_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` VARCHAR(36) NOT NULL,
    `staffNumber` VARCHAR(12) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `middleName` VARCHAR(80) NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `preferredName` VARCHAR(80) NULL,
    `contactEmail` VARCHAR(254) NULL,
    `phone` VARCHAR(30) NULL,
    `dateOfBirth` DATE NULL,
    `nationalId` VARCHAR(50) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED') NULL,
    `employmentType` ENUM('PERMANENT', 'FIXED_TERM', 'PART_TIME', 'VISITING', 'ADJUNCT', 'PROJECT', 'TEMPORARY') NOT NULL,
    `employmentStatus` ENUM('DRAFT', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `profileStatus` ENUM('DRAFT', 'INCOMPLETE', 'SUBMITTED', 'VERIFIED') NOT NULL DEFAULT 'DRAFT',
    `hireDate` DATE NULL,
    `endDate` DATE NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_staffNumber_key`(`staffNumber`),
    INDEX `Employee_employmentStatus_idx`(`employmentStatus`),
    INDEX `Employee_profileStatus_idx`(`profileStatus`),
    INDEX `Employee_hireDate_idx`(`hireDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeAssignment` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `positionId` VARCHAR(36) NULL,
    `unitId` VARCHAR(36) NOT NULL,
    `supervisorEmployeeId` VARCHAR(36) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `assignmentType` ENUM('PRIMARY', 'ADDITIONAL', 'ACTING') NOT NULL DEFAULT 'PRIMARY',
    `isActing` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(500) NULL,
    `createdById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeAssignment_employeeId_endDate_idx`(`employeeId`, `endDate`),
    INDEX `EmployeeAssignment_unitId_endDate_idx`(`unitId`, `endDate`),
    INDEX `EmployeeAssignment_supervisorEmployeeId_endDate_idx`(`supervisorEmployeeId`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeStatusHistory` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `fromStatus` ENUM('DRAFT', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED') NULL,
    `toStatus` ENUM('DRAFT', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED') NOT NULL,
    `effectiveDate` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeStatusHistory_employeeId_effectiveDate_idx`(`employeeId`, `effectiveDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmergencyContact` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `relationship` VARCHAR(60) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmergencyContact_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Qualification` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `institution` VARCHAR(150) NOT NULL,
    `award` VARCHAR(120) NOT NULL,
    `fieldOfStudy` VARCHAR(120) NULL,
    `yearCompleted` INTEGER NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Qualification_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeChangeRequest` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `requestedById` VARCHAR(36) NOT NULL,
    `field` VARCHAR(50) NOT NULL,
    `currentValue` VARCHAR(500) NULL,
    `requestedValue` VARCHAR(500) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewComment` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeChangeRequest_status_idx`(`status`),
    INDEX `EmployeeChangeRequest_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `category` ENUM('CONTRACT', 'IDENTIFICATION', 'QUALIFICATION', 'CV', 'APPOINTMENT_LETTER', 'OTHER') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `originalFilename` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(100) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `sensitivity` ENUM('INTERNAL', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED') NOT NULL DEFAULT 'CONFIDENTIAL',
    `version` INTEGER NOT NULL DEFAULT 1,
    `expiryDate` DATE NULL,
    `retentionStatus` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `uploadedById` VARCHAR(36) NOT NULL,
    `verifiedById` VARCHAR(36) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verificationNote` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Document_storageKey_key`(`storageKey`),
    INDEX `Document_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `Document_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(36) NOT NULL,
    `recipientUserId` VARCHAR(36) NOT NULL,
    `eventType` VARCHAR(80) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `safeSummary` VARCHAR(500) NOT NULL,
    `relatedEntityType` VARCHAR(50) NULL,
    `relatedEntityId` VARCHAR(36) NULL,
    `priority` ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,

    INDEX `Notification_recipientUserId_readAt_idx`(`recipientUserId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(36) NOT NULL,
    `actorUserId` VARCHAR(36) NULL,
    `actorLabel` VARCHAR(120) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(36) NULL,
    `reason` VARCHAR(500) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditEvent_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `AuditEvent_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionKey_fkey` FOREIGN KEY (`permissionKey`) REFERENCES `Permission`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleAssignment` ADD CONSTRAINT `RoleAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleAssignment` ADD CONSTRAINT `RoleAssignment_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleAssignment` ADD CONSTRAINT `RoleAssignment_scopeUnitId_fkey` FOREIGN KEY (`scopeUnitId`) REFERENCES `OrgUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleAssignment` ADD CONSTRAINT `RoleAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleAssignment` ADD CONSTRAINT `RoleAssignment_revokedById_fkey` FOREIGN KEY (`revokedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrgUnit` ADD CONSTRAINT `OrgUnit_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `OrgUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrgUnit` ADD CONSTRAINT `OrgUnit_headEmployeeId_fkey` FOREIGN KEY (`headEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Position` ADD CONSTRAINT `Position_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `OrgUnit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `OrgUnit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_supervisorEmployeeId_fkey` FOREIGN KEY (`supervisorEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeStatusHistory` ADD CONSTRAINT `EmployeeStatusHistory_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeStatusHistory` ADD CONSTRAINT `EmployeeStatusHistory_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmergencyContact` ADD CONSTRAINT `EmergencyContact_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Qualification` ADD CONSTRAINT `Qualification_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeChangeRequest` ADD CONSTRAINT `EmployeeChangeRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeChangeRequest` ADD CONSTRAINT `EmployeeChangeRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeChangeRequest` ADD CONSTRAINT `EmployeeChangeRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

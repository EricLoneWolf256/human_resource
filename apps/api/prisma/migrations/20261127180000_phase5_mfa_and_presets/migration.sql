ALTER TABLE `User`
  ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mfaSecret` VARCHAR(255) NULL;

CREATE TABLE `MfaRecoveryCode` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `MfaRecoveryCode_codeHash_key`(`codeHash`),
  INDEX `MfaRecoveryCode_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReportPreset` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `query` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ReportPreset_userId_name_key`(`userId`, `name`),
  INDEX `ReportPreset_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MfaRecoveryCode`
  ADD CONSTRAINT `MfaRecoveryCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportPreset`
  ADD CONSTRAINT `ReportPreset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

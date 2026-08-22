-- Reversión de 0002.
SET NAMES utf8mb4;

DROP TABLE IF EXISTS `sync_lotes`;

-- Ojo: si hay usuarios sin email, esto falla. Hay que resolverlos antes.
ALTER TABLE `usuarios`
  MODIFY `email` VARCHAR(190) NOT NULL,
  MODIFY `email_normalizado` VARCHAR(190) NOT NULL;

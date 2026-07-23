-- Esquel LAB — datos semilla
-- Ejecutar DESPUÉS de schema.sql, una sola vez.
--
-- Usuario admin inicial:
--   usuario:    admin
--   contraseña: admin123
--
-- IMPORTANTE: el sistema fuerza el cambio de contraseña en el primer
-- ingreso (debe_cambiar_password = 1). Cambiala apenas entres a
-- /admin y actualizá el email real del referente del programa desde
-- el panel de Usuarios.

INSERT INTO usuarios (nombre, usuario, email, password_hash, rol, activo, debe_cambiar_password)
VALUES (
    'Administrador',
    'admin',
    'admin@esquellab.local',
    '$2y$12$./730EJ4rRl3eljTJmMwh.CL041No1bapIMl1lY4OYlSWrIsVBwkq', -- admin123
    'admin',
    1,
    1
);

// Variables por defecto para las pruebas; DATABASE_URL puede sobrescribirse desde el entorno.
process.env.DATABASE_URL ??= 'postgresql://postgres@localhost:5432/pos_test';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.COOKIE_SECURE = 'false';
process.env.UPLOADS_DIR ??= './uploads-test';
process.env.LOGIN_RATE_LIMIT ??= '1000';
process.env.ONLINE_ORDER_RATE_LIMIT ??= '1000';
process.env.PUBLIC_STORE_DOMAIN ??= 'pedidos.test.co';

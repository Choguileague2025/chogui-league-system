const { z } = require('zod');

const loginSchema = z.object({
    username: z.string().trim().min(1, 'Usuario requerido').max(50, 'Usuario demasiado largo'),
    password: z.string().min(1, 'Contrasena requerida').max(100, 'Contrasena demasiado larga')
}).strict();

module.exports = {
    loginSchema
};

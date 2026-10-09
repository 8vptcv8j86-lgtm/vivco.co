import { createIntakeHandler } from '../lib/intake.js';
export default {fetch: createIntakeHandler({token:process.env.VIVCO_INTAKE_TOKEN})};

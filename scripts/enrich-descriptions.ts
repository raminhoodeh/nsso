import { maintainFilms } from './operator-film-maintenance.mjs';
import { reportFailure } from './operator-openai.mjs';
maintainFilms('descriptions').catch(reportFailure);

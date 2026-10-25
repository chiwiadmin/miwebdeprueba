import { handle } from "../../server/api.js";
import artists from "../../public/assets/data/artists.json";

export const onRequest = ({ request, env }) => handle(request, env, new Date(), artists);

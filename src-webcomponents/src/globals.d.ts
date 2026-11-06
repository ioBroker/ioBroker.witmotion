/** The pictures of `src-shared/assets`: their URL next to the module, see `sharedPictures()` in `vite.config.ts` */
declare module '*.png' {
    const url: string;
    export default url;
}

import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

interface ITeamifyIconProps extends React.ComponentProps<"span"> {
  /**
   * If true, play a one-time entrance spin animation.
   */
  animate?: boolean;
  /**
   * If true, disable hover spin animation.
   */
  noSpin?: boolean;
  /**
   * If true, show a border around the icon.
   */
  bordered?: boolean;
  /**
   * Size of the bordered icon: "sm" (default), "md", "lg"
   */
  size?: "sm" | "md" | "lg";
}

const borderedSizes = {
  sm: { wrapper: "p-1.5", icon: "size-3.5" },
  md: { wrapper: "p-2", icon: "size-4" },
  lg: { wrapper: "p-2.5", icon: "size-5" },
};

/**
 * The iteamify mark, embedded as a data URI rather than imported.
 *
 * `@iteamify/ui` is consumed by two different bundlers — the Next.js web build
 * and the Vite Electron renderer — which type binary asset imports
 * differently (see `provider-logo.tsx` for the same workaround). Inlining
 * gives both consumers one source of truth and keeps the mark off the
 * network path entirely.
 *
 * Source is a 96px master: the component tops out at `size-8` (32px), so this
 * covers 2x displays with headroom.
 */
const MARK_SRC =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAPoAAAD6AG1e1JrAAATM0" +
    "lEQVR42u2cd1RU59bGvUnu/dZS6b2jSW7sGkvsGns0igVLFMUCiqLYWzSKvYuoGEVBdEYERooI0iyIIghSFIamOPRuj7GsfLLvPu" +
    "fMmTkzzMAAM+phzbvWu/wnMlnPb/Z+zrP3kVat1Ed91Ed92H/aPOAYavE587WzOIe1sjlcvKHa2ZxT2tncLTr884NaAe9rtUoqOD" +
    "o5nAEo8g3tLO5H/BPk3ixutVYWZ7tejpeGWjUlHN08riZ+2wPqFV32rUIQk9QKNuNo5fm2xxbDb4L4wmrg1GJFbG7O/4Neik8Hg1" +
    "TOBsM0bpRB2oVMgwcXaoweXgSjDOL6gXGmPxjzA8A4KwBMsnlgknMJTHIvgWleIJg+CgLTx0Fglh8MZk9CwFxwGcwL8BaGgkXRFb" +
    "AoxlsSBpal4cT9aFEWXm5ZcTXNsiIyxLoywsmiJsb0s4mvyefpooiPmyw+42plc1c39vP1E8+O00s+n25wnwMGKXhTuWCYdgEM0/" +
    "E+8AUSwkMlQyjDW34VrCoiwKoykviz1roiMtKqKrrHp1UfXL8i+70SxBdWwv9rZnNGKeQ1d85b6iacjdW/5wP6SedAP/k8GNw///" +
    "kg4LWujPpoXR3l06kqtu0n0V+bz7FTmvhic85rleL573rFj/fqrxvvVaGXcBb0EhHAlwShKgqsqqMyrCoirVWrPoqEYgmUDgCvJp" +
    "/rJLfX3/IapnvH671uvDfo3cXbGAgPVAyhQgzBujq6QqUQNLO5o1UhvrAV3ZNp9nGn2+nGnq7WjTsDCAGUA8FfIQhmTYFQFZ313d" +
    "MITdU8+WRxTqgQQK3uQ665xAfyeF/r3PR8oBN7GnRvIQCWQLCqijqnmv6fxUlRGQDiiUgqG+heP+mgc+MUIARoNoR0FUMoZ0CojK" +
    "y1rInupYoKKFclABxbOIs+LOLo/2nF/Fmicx0BfBEQQhoFwaoyKkr5FZDN+aBaANytos+KPjFBO+ZP0L52ElgJAXMCeoG5cisgm1" +
    "uh4gpYKgIQ6eGlHYUA5EI43TQIacqDYC4LQhkDQlXEEiVXADdNlQDwKWuy6Inr6vFi7cgToBCE218mBMvyiMtKDmFcT1U+Belk+l" +
    "mQHxTr+o3WVY+PWhEewGYIFuUR6codO2edH6dCAKmip5+ww2Za4ccBIYDKIIh8QUUQ8FqUhlcp14Xz8Mkki1Omovazkv6YtuFHOm" +
    "qFHQM2Q7AgAYS9V8WjqKMKZkEFBFxR/+cd1tW8ggDkQYhWBILXZ4dgXhJWqIJpKO9rYmygzN5fZzkD8C/Ny+7vvjwIvEZBMC8KS1" +
    "BJIjbg+xijaCVKSr/bZX2GRrB7umboUfgkEFJUAwGvt+r2wNmcLkTraGbrcSO+7TIBBLlv1wxxB6VAuPN5IFgUhU5U6XS67SNvAx" +
    "TyWuO/9dzXxNsT9XpNkFtPzeAjQEK4zEIIgpC/TcqutP40S5pszgRMyQ8UWD/+jeJ7EK+vKAQ48MiNTwrhvjIhBB/65Ltijezz/8" +
    "WevhbvOWwvUSj2XQxvQbi8d9fOOj/RJMWzUd8IzUD3PhqBbrVsg4D3hWl2sF6LePtCI/DwGY0gBNAYCDGNgXBW+RDyghe3nPdfPD" +
    "3/rXHJ7dYnhZDcdAgmOYFnW94rjxfdjbAS+HUhHP3CIASENfRywSc9VnNjtS1n3dGhbnjd+yt1tX71Je80nyrjZdHv2i0LfUFeR9" +
    "GtaGd76XFn00DvGKMgFDLo+GeG4FsXAt//6Gd999XKOcn4O8fUxd8uSL7afn5ikfXchPfWc+PBak4cWM6OBYtZN8B8ZgyYzYgC0+" +
    "kRYDI1DIxtQ8FocggYTgoEAxserIqoEVx5+xeEvHkNl16/Br+Xr4D74iWce/YCvGpewKmq5+BR8QyOlj2DPfnVsC61BOyis2BQUC" +
    "wYhXg1D0K8DAhJDUMwzLiYa8i/aPPZhO+0iq/7/ZLMfd87PXj3/aJ0+M4xBb51SIb28+9Bu3l3wdr+DkK4BZZ2NxHCdTD/LRohRI" +
    "LptKsI4QoYT7kMRpOCwXDiJVgRUS0IRvF5r19R4j9/CT5PJcV3R/EPlzyF/UU1sLugGrY/qYatj6tgQ3YF2F7NBKtAX9VDSL3w0S" +
    "DdNxFBLGoVG/vNZxO/47K8wR2cs6t/cM6C/y7OAIQA3y1Mg28d70P7BUnQbn4ikFVgfxur4BZY2BFVcA3MEAJVBeFYBVeEVRAELl" +
    "erBYT4Fxnin6l+ASdF4j+FQ1Lib0HxN+VVwvrcSliNEFwyymBsUOpL/VDvUATBw80aDyFQN+YkDx9Tedo38N70xHuahxB4unHE9e" +
    "IhBB5C4Okl4E0krg9PL+kcefWTz53EtrQVQdjrp3BMPnt/77zq8W8dXR5/6LgsFzoszYYflvARwkMgq2BhKlUFC4gqSEAIdxitiK" +
    "gCYSsiqwBb0RSiFQWD85UqASE+hyl+5XM4Xi4Wf5+U+L8T4udUwOqsCljOLwdnBOD0oAx+u/HkQ/8T91rmG9idVxcO6LxS8L7Tin" +
    "zo6PIIOizLAbIKlmRSVbCIqIIUaO8grAJsReIqwFaEVUC2oulEKwoHE1uqFS1GAIT4Z0nxn4vEP1IqFn8Xir+NIf46WvxMFP9hGS" +
    "xC8R3SSmFuSgnMuF1Q+9PRuwtalPjdVxRod11TXNllVSEgBOi0/DFCyMMqICDwGa0oVdyKyCpo2JAXIQBC/NMo/p8M8Q8Wo/iFtP" +
    "hV8AdD/FVM8dPLYIFQfLvkYphxrxhsbuTX9vFI+KXFAOi2rnx/17Wl0GV1EXReVQCdVjyBjsuJKsiFH8hWlCluRTINOY5hyDEMQw" +
    "4Dh8uVAlr8Ywzx9xLiC1D8fEr8jQzxXVD8JaT4pbAgtRTs74vFt00ogonxhTAyLOdDh12RJqwXv8/GUr1u6yvedltXBl3XlCAEYR" +
    "WQrShP3IqaYsjYiuaHVAlo8d1I8WtI8Xei+K6E+I8o8ddKib+QIf6spGKYzhD/19uF8MutAujtlcxnf/vZVDWvx4Yq6L6+ArphFW" +
    "Argi5YBZ1XPqFaUVMMeabYkOcFlQto8Q9Iib+ZEB+fdNbik87KrHIJ8eczxU8shil3afELYAyKP/KmAIZey4cOu6InsxpAj03VQT" +
    "02VkP3DZWArQi6ri2hWtHKAhAbci7DkB8yDDmZYciMbMAwZPvAcgEt/h4p8TfQ4uOTzjIUfzFD/DlS4tvcEYs/ghD/+hMYFINfEo" +
    "+7+awG8OOmmuwff6+BHhuFVUC2IqIKGmHI82lDvs0w5GtkFdhdqhQcKKLE34HibyXFryTFX0OLn4Hi45OOI0P8mSj+tMQikfjj4l" +
    "D8WLH4A1H8H/0egt7UM/+0Ge5uxFoAPTfXvEAI0ON3ZhXUNWRxK2IY8sKGDXnmpXLBHnzSocXfxBB/BYq/lBYfn3Tm4RiCKf5khv" +
    "ijCfFv0OLnQ0//DNCbdha0xnqA5hg39o6Ke215Wttz81OgqgAhrK8EsSEXyTbkJYob8gwEsEM4WiDEXy8lvhMtPj5mzk6WFH8CQ/" +
    "zhKP6Qayh+tFD8GRzQHncStH45Dhqj3XjsBbD1GfT8AwFgFZAQ6hhyodiQyVZEG3IGw5DvMww5XsKQp/HKBdKjBUp8Kt06MMT/DZ" +
    "90pjLEH0uKLxCJP4AQ3y8T9Gf4gvb4MyIAmqPd8lgLoLfrc+i1BSFspiDINORVihuy9LBuin+ZgBotVNYZLdDpViQ+PmZOwicdWv" +
    "xRUuL/6McHg5n+oDPBB7R/pQEcIwD8gy8e/YudOcD1BfTeihD+EEJQliHbU4Y8ya9cIDFayJAcLdhJiT/+tlj8YSj+YFp8fxR/Vi" +
    "DoTuQKAZwGrXF/0gDAYKhrW3YC2IYA6CoQtiLKkKsYhlwsMuRODRnyAklDtrlYJmhotGDLEJ8IWKNuisXvT4qfBYazQ0B3kh8C4C" +
    "CAsxSAsQQAXOCMPgxthxzSZyWAn7a/BBLCVhmtSK4h1zOsExkyNawb71siEI8Wyqh0m1J3tECLTwSsYfikQ4vfA8U3sg8DvSmXEM" +
    "BF0LWhAXgigBOgNYbtAHYggO3CKkBDJlvRpqeKG7Jz/YY89kKZQNZoYYaM0QIh/s/CgNU/ihA/G4znRoC+bTAC4IkBjPcWAdAcg2" +
    "vM0YfYC6DvzldAQmC2IkUMebl8Q6ayAWXIv3BLBIqOFmjx+xHi++WA8bxo0J92hQIwmQDgCzo25xkAPCgAo1gMoN+u10BCYLYiCU" +
    "OuZhgyY1inoCGPPlciUGS0ICG+fw6YzL8BBjjQowAEIYAABgAvfAI6xQBwkMUAdiOAXTKqQNqQ14sNmRzWrVBsWDcCAdDpdnoDow" +
    "VK/FwwdbgFhpiiDaZfRQChYgATLyCAc2IARAYYc4TdAPrv+QtICNJVoAxDxu3ZMJ8SgSKjhb60+I7xYDjrJgKIpgBMDQU9EoA/BW" +
    "DCOckQhgA0Rh1gMYC9CGAPowqEhlynFTXGkJ3Ehjz0bImgodECIX73gDwwW3QPjOziwHDmDQaAy2jAgQwAPtIpmN0ABux7AxJVIK" +
    "8Vbax/WEdtzyQNmdieDfIuEdQ3WugbSYj/CMW/D8Zz7ooB4CTVYHo4A4AfI4QRAMQhTGMkAcCVpQD2v4EBe4UQmmrI9LBuad3t2Q" +
    "DvYoG80cJPhPj+KP7iNDC2TwLj2QQA7P8zr4OBCECIMAPQAJgh7BiZATRG7mcvgIEH/gayCvYKq0CqFckzZIntWT2G3M+rWCBrtE" +
    "CI383/MZjjZNVkXqoQQLwkgGlhDADMEHaaCmHCFMxqAIMOvoWB+4UQFDXkDYobct8zxQLp0cJPkY9J8S2wZZnOf4gAUhDAPQrALA" +
    "LANQQQSQGwDZEMYRO8pVLwIQSwj8UADiEAogr2C6tAypBlDutEhixvWCc25N6eRQLmaKEPIX5APljgf2fqwEcAD8BkLgXAaPYdBB" +
    "CLBkwBEIUwIQDJEHZCFMJYDWDw4XdAVoF0K2q2IWeTVdDzVLGAHi3Q4lsuzwczx1wGAMKAExkAMAPMiGCk4ADJFCwRwggAe1lcAW" +
    "5v3xFVIGpF9RnylkYYsrAVdT9ZmE8ErD4RhPhPwGpFAZgvEgJYQABIZwC4jQBuCkNYhFQI85UMYSQAKoRpjGAxgCFu7wVkFRySUQ" +
    "UKGHJ3aUOWep2l26mirN4ofnf/fLBaWQIWToVCADkIIBNHDjSABDTg28IQFiM7hNkQIcxLKoQRAPawF8BQ9/dxCAFErUiWIe9oyJ" +
    "Dlv87S2bM4lfjmW68uB4slpWDuRFTAYzGAeWkIIFkMQCKEEQAC5adgYQhjO4AtQ44IAcgz5J0vqVZU3/ZMliEvy33bwb0swHpNDV" +
    "g6VyCAEgrAQgJANgLIoADYJ0uGMBJAuFQK5spaRQoB7GZxCzr+oetQ9w8gUQVKMuQOLnmhVi4vN1stkwaA4cuBBpCKAJIYAK5LpW" +
    "BmCKu7iiQzAJsBkBDcP1wjq8DtHQw+JKMVNdWQV+YPt3J5vtmSBrC4GAEIwEwE4CEjhN2tJ4TJX0WSAIazHMDQI+97YCv6WKcV1W" +
    "fIDbzOglUQTvxsCkA1AihnAMDBmwMdwlKlQth1cQibKh3C6q4iyQwwfBe7AZBVcPTD7jqtqImG3GVtcU3XlUXtRQCW0gCK0ICfMA" +
    "CIQxgFIFYqBTe8imwxAFxd4auhRz8E061IniGLWpE8Q15X8a7bhrJB9M+lAVg4l4kBSIQwAkCiVAqOUHgVSYaw4TvZD4BsRa7wzZ" +
    "AjH47Va8j1bM+6/15d03VD+RDmz7RyeYoAqtCAaQDMFJwulYKZIUyxVSQZwloKAFE7OvLWHiGUKW7I+H7ppppLXdc/rfNLTcUASh" +
    "khLJfMABIA7JgpWPFVJAVgR8sCQJxentAa29DqgQffJg3c/6ZW1IoYVdB7+/NnvVyfcXq6Pu0n7+dYLSUAVApDWKFUCEuXDGFNWE" +
    "WSIWxYCwQgMbBze2PS/+Bfw/vvfzOn3+5XTn33vLLps+tlb6JlNfR3xQCYISxHHMJEABqzijwmmYKHbW/ZAJpzSADSIUwiBSc1ax" +
    "VJpmA1APnHYmk1BWBxiVQIy5AfwhqzilQDUARAuVQKZoYw6VVkZONWkUQGGLZNDUAhABIhTEmrSALAz2oA8gE4V2+SCGELm7uK9J" +
    "BcRWIGaPOzqxqAvIMZwEV2CFPSKpICUNuqk+t/1GrLBmBLAShUzSoSAbQeuqVKrbRcDyjvLZmC61tFRjd+FYkhrM3PW5PVSsud8s" +
    "FX5otLKyRDWGNXkT7yV5EEgKFbtqmFrq8KlpScUdkqEjNA68GuPdUq1+cDSwo6mi8q+KehVaRBE1aRrYdtu6VWWIFjtkjgLXsVGd" +
    "+MVeSuWo2hrv3U6ipwjOc9MjBzzCtQ5iqyzfCdB9TKNgaC06NOZg78V41ZRcp8H5T4V5Ej9kW3mvYZf6kqW4+pI78HAihqziqy7a" +
    "hDASbjXVur1WzqU9GCVFMT+/uRjV1Fao49/pfGaPc1rP29EF/aMZyTMNLQLi7OaObNjw2sIp9rjTt1nNW/mOlLPkazow0NpkXN15" +
    "8Wvl/f9jJHd0rgZXwCOqVrw92qNd5nBL4t8I1aJfVRH/VRH4XP/wDLHrrooqqTrAAAAABJRU5ErkJggg==";

/**
 * iteamify brand mark.
 *
 * The same teal-to-blue glyph the favicon, the desktop app icons and the
 * marketing lockup use, so every surface reads as one brand. `MARK_SRC` below
 * is generated — run `node scripts/generate-brand-assets.mjs` after editing the
 * vector sources in `apps/web/public/` rather than hand-editing the data URI.
 */
export function ITeamifyIcon({
  className,
  animate = false,
  noSpin = false,
  bordered = false,
  size = "sm",
  ...props
}: ITeamifyIconProps) {
  const [entranceDone, setEntranceDone] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setEntranceDone(true), 600);
    return () => clearTimeout(timer);
  }, [animate]);

  const mark = (
    <img
      src={MARK_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="block size-full select-none object-contain"
    />
  );

  if (bordered) {
    const sizeConfig = borderedSizes[size];
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center border border-border rounded-md",
          sizeConfig.wrapper,
          className
        )}
        aria-hidden="true"
        {...props}
      >
        <span
          className={cn(
            "block",
            sizeConfig.icon,
            !entranceDone && "animate-entrance-spin",
            entranceDone && !noSpin && "hover:animate-spin"
          )}
        >
          {mark}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-block size-[1em]",
        !entranceDone && "animate-entrance-spin",
        entranceDone && !noSpin && "hover:animate-spin",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {mark}
    </span>
  );
}

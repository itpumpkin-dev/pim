import { type IconType } from '@/data/products';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import BuildIcon from '@mui/icons-material/Build';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import ColorizeIcon from '@mui/icons-material/Colorize';
import ConstructionIcon from '@mui/icons-material/Construction';
import HandymanIcon from '@mui/icons-material/Handyman';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LayersIcon from '@mui/icons-material/Layers';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import OpacityIcon from '@mui/icons-material/Opacity';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ScienceIcon from '@mui/icons-material/Science';
import WaterDropIcon from '@mui/icons-material/WaterDrop';

/**
 * Category label -> icon. Product data is EAV-driven and has no icon field of
 * its own, so the display icon is resolved client-side from the category name.
 * Unmapped categories (e.g. categories coming from freshly imported catalog
 * data) fall back to a generic icon via getCategoryIcon().
 */
export const CATEGORY_ICONS: Record<string, IconType> = {
    'กาวยาแนว MS-Polymer': ScienceIcon,
    กาวตะปู: ConstructionIcon,
    ซิลิโคน: WaterDropIcon,
    โพลียูรีเทนยาแนว: OpacityIcon,
    พียูโฟม: BlurOnIcon,
    อุปกรณ์ทำความสะอาด: CleaningServicesIcon,
    'ปืนยาแนว/ปืนยิงโฟม': HandymanIcon,
    'น้ำยาล็อกเกลียว/ตรึงเพลา': PrecisionManufacturingIcon,
    กาวร้อน: LocalFireDepartmentIcon,
    เทปซ่อมแซม: LayersIcon,
    กาวอะคริลิคยาแนว: ColorizeIcon,
    'กาวอีพ็อกซี่/เอนกประสงค์': BuildIcon,
};

export function getCategoryIcon(category: string): IconType {
    return CATEGORY_ICONS[category] ?? Inventory2OutlinedIcon;
}
